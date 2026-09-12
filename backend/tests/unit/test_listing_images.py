"""Imágenes derivadas de la foto real de una publicación.

Lo que se fija acá es la línea que separa lo aceptable de lo que no: las
variantes se generan A PARTIR de la foto publicada (imagen-a-imagen), nunca
desde cero con un texto, y la foto de portada no se toca.
"""
import json
import sys
import types
import unittest
from unittest.mock import patch

# El entorno de desarrollo no tiene salida a internet para instalar
# dependencias, asi que se stubea lo unico que falta en la cadena de imports.
try:  # pragma: no cover - depende del entorno
    import dotenv  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _dotenv_stub = types.ModuleType('dotenv')
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules['dotenv'] = _dotenv_stub

from src.utils import listing_image_service as img
from src.utils import listing_apply_service as aplicar


ITEM = {
    'id': 'MLA1',
    'pictures': [
        {'id': 'pic-real-1', 'secure_url': 'https://http2.mlstatic.com/real1.jpg'},
        {'id': 'pic-real-2', 'secure_url': 'https://http2.mlstatic.com/real2.jpg'},
    ],
}


class GeneracionTest(unittest.TestCase):
    def test_usa_la_foto_publicada_como_entrada(self):
        """La clave de todo: imagen-a-imagen, no texto-a-imagen."""
        with patch.object(img, '_descargar', return_value=(b'bytes-reales', None)) as bajar, \
             patch.object(img, '_generar_con_gemini',
                          return_value=(b'png', 'gemini-2.5-flash-image', None)) as generar, \
             patch.object(img, 'get_image_config',
                          return_value={'provider': 'gemini_image'}), \
             patch.object(img.os, 'makedirs'), \
             patch('builtins.open', unittest.mock.mock_open()):
            salida = img.generate_variants('MLA1', ITEM, ['contexto'])

        self.assertTrue(salida['ok'])
        bajar.assert_called_once_with('https://http2.mlstatic.com/real1.jpg')
        # El primer argumento del generador son los bytes de la foto real
        self.assertEqual(generar.call_args[0][0], b'bytes-reales')

    def test_sin_foto_de_origen_no_genera_nada(self):
        """No hay de donde derivar: inventar una foto de producto no es opcion."""
        salida = img.generate_variants('MLA1', {'pictures': []}, ['contexto'])
        self.assertFalse(salida['ok'])
        self.assertIn('no tiene ninguna foto', salida['error'])

    def test_avisa_cuando_no_hay_cuota_de_imagenes(self):
        class Resp:
            status_code = 429
            text = 'quota exceeded'

        with patch.object(img.database, 'get_setting', return_value='clave'), \
             patch.object(img.requests, 'post', return_value=Resp()):
            _datos, _modelo, error = img._generar_con_gemini(b'x', 'instruccion')

        self.assertIn('facturación', error)

    def test_un_estilo_que_falla_no_tumba_a_los_demas(self):
        def generar(bytes_origen, instruccion):
            if 'primer plano' in instruccion:
                return None, 'm', 'se cayo'
            return b'png', 'm', None

        with patch.object(img, '_descargar', return_value=(b'x', None)), \
             patch.object(img, '_generar_con_gemini', side_effect=generar), \
             patch.object(img, 'get_image_config', return_value={'provider': 'gemini_image'}), \
             patch.object(img.os, 'makedirs'), \
             patch('builtins.open', unittest.mock.mock_open()):
            salida = img.generate_variants('MLA1', ITEM, ['contexto', 'detalle'])

        self.assertTrue(salida['ok'])
        self.assertEqual(len(salida['generadas']), 1)
        self.assertEqual(len(salida['errores']), 1)

    def test_los_estilos_nunca_piden_cambiar_el_producto(self):
        """Cada instruccion tiene que preservar el producto, no reinventarlo."""
        for estilo, instruccion in img.ESTILOS.items():
            minusculas = instruccion.lower()
            self.assertIn('como base', minusculas, estilo)
            self.assertIn('mismo producto', minusculas, estilo)
            self.assertIn('logos', minusculas, estilo)


class MensajesDeErrorTest(unittest.TestCase):
    """El mensaje del proveedor es mas util que cualquier parafraseo propio."""

    def _clave(self, valores):
        return patch.object(img.database, 'get_setting',
                            side_effect=lambda k, d=None: valores.get(k, d))

    def _resp(self, cuerpo, estado=429):
        class Resp:
            status_code = estado
            text = ''

            def json(self):
                return cuerpo
        return Resp()

    def test_muestra_el_mensaje_real_y_el_link(self):
        cuerpo = {"error": {
            "message": ("You have no credits remaining. Add credits at "
                        "https://platform.openai.com/settings/organization/billing/."),
            "code": "credit_balance_exhausted"}}
        with self._clave({'openai_api_key': 'sk-x'}), \
             patch.object(img.requests, 'post', return_value=self._resp(cuerpo)):
            _d, _m, error = img._generar_con_openai(b'x', 'y')

        self.assertIn('no tiene credito', error)
        self.assertIn('platform.openai.com', error)

    def test_distingue_limite_de_velocidad_de_falta_de_credito(self):
        cuerpo = {"error": {"message": "Rate limit reached",
                            "code": "rate_limit_exceeded"}}
        with self._clave({'openai_api_key': 'sk-x'}), \
             patch.object(img.requests, 'post', return_value=self._resp(cuerpo)):
            _d, _m, error = img._generar_con_openai(b'x', 'y')

        self.assertIn('velocidad', error)
        self.assertNotIn('no tiene credito', error)

    def test_una_clave_invalida_se_reporta_como_tal(self):
        cuerpo = {"error": {"message": "Incorrect API key provided",
                            "code": "invalid_api_key"}}
        with self._clave({'openai_api_key': 'sk-x'}), \
             patch.object(img.requests, 'post', return_value=self._resp(cuerpo, 401)):
            _d, _m, error = img._generar_con_openai(b'x', 'y')

        self.assertIn('invalida', error)

    def test_un_codigo_desconocido_igual_muestra_el_mensaje(self):
        cuerpo = {"error": {"message": "Something unusual happened",
                            "code": "algo_nuevo"}}
        with self._clave({'openai_api_key': 'sk-x'}), \
             patch.object(img.requests, 'post', return_value=self._resp(cuerpo, 500)):
            _d, _m, error = img._generar_con_openai(b'x', 'y')

        self.assertIn('Something unusual happened', error)


class ProveedorImagenTest(unittest.TestCase):
    def _config(self, valores):
        return patch.object(img.database, 'get_setting',
                            side_effect=lambda k, d=None: valores.get(k, d))

    def test_el_modelo_siempre_corresponde_al_proveedor_activo(self):
        """Con Gemini activo no se puede mandar el id de un modelo de OpenAI."""
        with self._config({'image_provider': 'gemini_image', 'image_model': 'gpt-image-2'}):
            config = img.get_image_config()
        self.assertEqual(config['provider'], 'gemini_image')
        self.assertTrue(config['image_model'].startswith('gemini'))

    def test_solo_ofrece_los_modelos_del_proveedor_elegido(self):
        with self._config({'image_provider': 'openai_image'}):
            config = img.get_image_config()
        self.assertTrue(all(m['proveedor'] == 'openai_image' for m in config['modelos']))

    def test_el_despachador_respeta_el_proveedor(self):
        with patch.object(img, '_generar_con_openai', return_value=(b'x', 'm', None)) as oa,              patch.object(img, '_generar_con_gemini') as ge:
            img._generar('openai_image', b'foto', 'instruccion')
        oa.assert_called_once()
        ge.assert_not_called()

    def test_usa_el_endpoint_de_edicion_y_no_el_de_generacion(self):
        """La foto real tiene que viajar como entrada: eso solo lo hace /edits."""
        class Resp:
            status_code = 200
            def json(self):
                import base64 as b
                return {"data": [{"b64_json": b.b64encode(b'png').decode()}]}

        with self._config({'openai_api_key': 'sk-x', 'image_provider': 'openai_image'}),              patch.object(img.requests, 'post', return_value=Resp()) as post:
            datos, _modelo, error = img._generar_con_openai(b'foto-real', 'instruccion')

        self.assertIsNone(error)
        self.assertEqual(datos, b'png')
        self.assertIn('/images/edits', post.call_args[0][0])
        self.assertEqual(post.call_args[1]['files']['image'][1], b'foto-real')

    def test_sin_clave_de_openai_avisa(self):
        with self._config({}):
            _d, _m, error = img._generar_con_openai(b'x', 'y')
        self.assertIn('clave', error.lower())


class AplicarImagenesTest(unittest.TestCase):
    def test_conserva_las_fotos_existentes_y_agrega_al_final(self):
        """La portada es la primera y no se toca: las generadas van despues."""
        peticiones = []

        class Resp:
            status_code = 200
            text = ''

        def fake_request(metodo, ruta, json_data=None):
            peticiones.append((metodo, ruta, json_data))
            return Resp()

        with patch.object(aplicar.listing_image_service, 'upload_to_meli',
                          return_value=('pic-nueva', None)), \
             patch.object(aplicar.meli_api, 'api_request', side_effect=fake_request):
            ok, error = aplicar._escribir_imagenes(
                'MLA1', [{'ruta': 'uploads/x.png'}], ['pic-real-1', 'pic-real-2'])

        self.assertTrue(ok, error)
        enviado = peticiones[0][2]['pictures']
        self.assertEqual([p['id'] for p in enviado],
                         ['pic-real-1', 'pic-real-2', 'pic-nueva'])

    def test_si_falla_la_subida_no_se_modifica_la_publicacion(self):
        with patch.object(aplicar.listing_image_service, 'upload_to_meli',
                          return_value=(None, 'HTTP 400')), \
             patch.object(aplicar.meli_api, 'api_request') as peticion:
            ok, error = aplicar._escribir_imagenes('MLA1', [{'ruta': 'x.png'}], ['pic-1'])

        self.assertFalse(ok)
        self.assertIn('HTTP 400', error)
        peticion.assert_not_called()

    def test_el_valor_anterior_son_los_ids_publicados(self):
        valor, error = aplicar.read_current_value('MLA1', 'pictures', item=ITEM)
        self.assertIsNone(error)
        self.assertEqual(json.loads(valor), ['pic-real-1', 'pic-real-2'])


class ParseoTest(unittest.TestCase):
    def test_lee_la_lista_guardada(self):
        rutas, error = img.parse_proposed('[{"ruta": "uploads/a.png"}]')
        self.assertIsNone(error)
        self.assertEqual(rutas, [{'ruta': 'uploads/a.png'}])

    def test_rechaza_un_json_invalido(self):
        rutas, error = img.parse_proposed('no es json')
        self.assertIsNone(rutas)
        self.assertIn('JSON', error)


if __name__ == '__main__':
    unittest.main()
