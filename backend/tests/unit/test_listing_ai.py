"""Generación y aplicación de mejoras de publicaciones.

Lo que se fija acá son las reglas que protegen publicaciones reales y activas:
no inventar datos técnicos, no mandar a Mercado Libre nada que viole sus
políticas, y no escribir jamás sin que alguien lo pida explícitamente.
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

from src.utils import listing_ai_service as ia
from src.utils import listing_apply_service as aplicar


CATALOGO = [
    {"id": "BRAND", "name": "Marca", "tags": {"required": None}},
    {"id": "GTIN", "name": "Codigo universal", "tags": {"catalog_required": None}},
    {"id": "UNITS_PER_PACK", "name": "Unidades por pack", "tags": {"conditional_required": None}},
    {"id": "COLOR", "name": "Color", "tags": {}, "values": [
        {"name": "Negro"}, {"name": "Blanco"}, {"name": "Transparente"},
    ]},
]


class ValidacionTitulosTest(unittest.TestCase):
    def test_acepta_un_titulo_normal(self):
        texto, ok, motivo = ia.validate_listing_change(
            'title', 'Piedra Difusora Chica Por 2 Unidades Para Acuarios')
        self.assertTrue(ok, motivo)
        self.assertEqual(motivo, '')

    def test_rechaza_titulo_mas_largo_que_el_limite_de_meli(self):
        largo = 'Piedra Difusora Chica Por Dos Unidades Para Acuarios Y Estanques Grandes'
        _texto, ok, motivo = ia.validate_listing_change('title', largo)
        self.assertFalse(ok)
        self.assertIn('60', motivo)

    def test_rechaza_titulo_demasiado_corto(self):
        _texto, ok, _motivo = ia.validate_listing_change('title', 'Piedra')
        self.assertFalse(ok)

    def test_normaliza_espacios(self):
        texto, ok, _m = ia.validate_listing_change(
            'title', '  Piedra   Difusora  Chica Por 2 Unidades Acuario ')
        self.assertTrue(ok)
        self.assertEqual(texto, 'Piedra Difusora Chica Por 2 Unidades Acuario')


class ValidacionPoliticasTest(unittest.TestCase):
    """Mercado Libre sanciona la publicacion que incluye contacto o enlaces."""

    def test_rechaza_email(self):
        _t, ok, motivo = ia.validate_listing_change(
            'description', 'Consultanos a ventas@hidroponiarosario.com por mayorista.')
        self.assertFalse(ok)
        self.assertIn('correo', motivo.lower())

    def test_rechaza_enlace_externo(self):
        _t, ok, motivo = ia.validate_listing_change(
            'description', 'Mira mas productos en https://hidroponiarosario.com')
        self.assertFalse(ok)
        self.assertIn('enlace', motivo.lower())

    def test_rechaza_mencion_a_whatsapp(self):
        _t, ok, motivo = ia.validate_listing_change(
            'description', 'Escribinos por WhatsApp para coordinar el envio.')
        self.assertFalse(ok)
        self.assertIn('contacto', motivo.lower())

    def test_no_confunde_una_medida_con_un_telefono(self):
        """'Bomba 12v 3000 rpm' tiene numeros pero no es un telefono."""
        texto = ('Bomba peristaltica de 12v y 3000 rpm para dosificacion. '
                 'Caudal regulable de 0 a 100 ml por minuto.')
        _t, ok, motivo = ia.validate_listing_change('description', texto)
        self.assertTrue(ok, motivo)


class ValidacionAtributosTest(unittest.TestCase):
    def test_acepta_atributos_del_catalogo(self):
        valor, ok, motivo = ia.validate_listing_change(
            'attributes', {'BRAND': 'Generica', 'UNITS_PER_PACK': '2'}, CATALOGO)
        self.assertTrue(ok, motivo)
        self.assertEqual(valor, {'BRAND': 'Generica', 'UNITS_PER_PACK': '2'})

    def test_rechaza_un_atributo_que_no_existe_en_la_categoria(self):
        """Un id inventado hace que Mercado Libre rechace el PUT entero."""
        _v, ok, motivo = ia.validate_listing_change(
            'attributes', {'VOLTAJE_INVENTADO': '12v'}, CATALOGO)
        self.assertFalse(ok)
        self.assertIn('no existe', motivo)

    def test_rechaza_un_valor_fuera_de_una_lista_cerrada(self):
        _v, ok, motivo = ia.validate_listing_change(
            'attributes', {'COLOR': 'Fucsia'}, CATALOGO)
        self.assertFalse(ok)
        self.assertIn('no es un valor admitido', motivo)

    def test_acepta_un_valor_de_la_lista_cerrada_sin_importar_mayusculas(self):
        valor, ok, motivo = ia.validate_listing_change(
            'attributes', {'COLOR': 'negro'}, CATALOGO)
        self.assertTrue(ok, motivo)
        self.assertEqual(valor, {'COLOR': 'negro'})

    def test_descarta_los_nulos_que_devuelve_la_ia(self):
        """null es la respuesta correcta cuando el dato no se puede deducir."""
        valor, ok, _m = ia.validate_listing_change(
            'attributes', {'BRAND': 'Generica', 'GTIN': None, 'UNITS_PER_PACK': ''}, CATALOGO)
        self.assertTrue(ok)
        self.assertEqual(valor, {'BRAND': 'Generica'})

    def test_si_todo_es_nulo_no_hay_nada_que_aplicar(self):
        _v, ok, motivo = ia.validate_listing_change(
            'attributes', {'GTIN': None}, CATALOGO)
        self.assertFalse(ok)
        self.assertIn('deducible', motivo)


class GeneracionTest(unittest.TestCase):
    ITEM = {
        'id': 'MLA1', 'title': 'Piedra Difusora Chica Por 2 Unidades',
        'attributes': [{'id': 'BRAND', 'name': 'Marca', 'value_name': 'Generica'}],
        '_description': 'Piedra difusora para acuarios.',
    }

    def test_no_conserva_atributos_que_no_se_pidieron(self):
        """Si el modelo agrega atributos por su cuenta, se descartan."""
        respuesta = json.dumps({'UNITS_PER_PACK': '2', 'INVENTADO': 'algo'})
        with patch.object(ia, '_llamar_gemini', return_value=(respuesta, 'modelo-x', None)):
            propuesta, _modelo, error = ia.suggest_attributes(
                self.ITEM, CATALOGO, ['UNITS_PER_PACK'])
        self.assertIsNone(error)
        self.assertEqual(propuesta, {'UNITS_PER_PACK': '2'})

    def test_respeta_los_nulos_del_modelo(self):
        """Un GTIN no se puede deducir de un titulo: null es lo correcto."""
        respuesta = json.dumps({'GTIN': None, 'UNITS_PER_PACK': '2'})
        with patch.object(ia, '_llamar_gemini', return_value=(respuesta, 'modelo-x', None)):
            propuesta, _m, _e = ia.suggest_attributes(
                self.ITEM, CATALOGO, ['GTIN', 'UNITS_PER_PACK'])
        self.assertNotIn('GTIN', propuesta)
        self.assertEqual(propuesta, {'UNITS_PER_PACK': '2'})

    def test_entiende_un_json_envuelto_en_markdown(self):
        respuesta = '```json\n{"UNITS_PER_PACK": "2"}\n```'
        with patch.object(ia, '_llamar_gemini', return_value=(respuesta, 'modelo-x', None)):
            propuesta, _m, error = ia.suggest_attributes(
                self.ITEM, CATALOGO, ['UNITS_PER_PACK'])
        self.assertIsNone(error)
        self.assertEqual(propuesta, {'UNITS_PER_PACK': '2'})

    def test_avisa_si_el_modelo_no_devuelve_json(self):
        with patch.object(ia, '_llamar_gemini',
                          return_value=('No pude determinarlo', 'modelo-x', None)):
            propuesta, _m, error = ia.suggest_attributes(
                self.ITEM, CATALOGO, ['UNITS_PER_PACK'])
        self.assertIsNone(propuesta)
        self.assertIn('JSON', error)

    def test_los_atributos_se_piden_en_modo_json(self):
        """Pedirlo solo por prompt devolvia prosa cada tanto y se perdia la sugerencia."""
        with patch.object(ia, '_llamar_gemini',
                          return_value=('{"UNITS_PER_PACK": "2"}', 'modelo-x', None)) as llamar:
            ia.suggest_attributes(self.ITEM, CATALOGO, ['UNITS_PER_PACK'])
        self.assertTrue(llamar.call_args[1]['json_mode'])

    def test_avisa_cuando_la_respuesta_se_corta_por_limite_de_tokens(self):
        """Un JSON truncado no parsea: el motivo real tiene que llegar al usuario."""
        class Resp:
            status_code = 200
            def json(self):
                return {"candidates": [{
                    "finishReason": "MAX_TOKENS",
                    "content": {"parts": [{"text": '{"UNITS_PER_PACK": "1", "GTI'}]},
                }]}

        with patch.object(ia.database, 'get_setting', return_value='clave'),              patch.object(ia.requests, 'post', return_value=Resp()):
            texto, _modelo, error = ia._llamar_gemini('hola')

        self.assertIsNone(texto)
        self.assertIn('limite de tokens', error)

    def test_sin_clave_de_gemini_no_falla_silenciosamente(self):
        with patch.object(ia.database, 'get_setting', return_value=''):
            _t, _m, error = ia._llamar_gemini('hola')
        self.assertIn('clave', error.lower())


class AplicarTest(unittest.TestCase):
    SUGERENCIA = {
        'id': 7, 'ml_id': 'MLA1', 'field': 'title', 'status': 'draft',
        'proposed_value': 'Piedra Difusora Chica Por 2 Unidades Para Acuarios',
        'current_value': 'Piedra Difusora',
    }

    def _aplicar(self, sugerencias, dry_run, item=None, escribir_ok=True, escribir_error=None):
        escrituras = []

        def fake_escribir(ml_id, field, valor):
            escrituras.append((ml_id, field, valor))
            return escribir_ok, escribir_error

        with patch.object(aplicar.database, 'get_listing_suggestions', return_value=sugerencias), \
             patch.object(aplicar.database, 'update_listing_suggestion') as actualizar, \
             patch.object(aplicar.database, 'save_listing_revision', return_value=99) as revision, \
             patch.object(aplicar, '_leer_item',
                          return_value=(item or {'title': 'Piedra Difusora', 'category_id': 'MLA1'}, None)), \
             patch.object(aplicar, '_escribir', side_effect=fake_escribir):
            resultados = aplicar.apply_suggestions([s['id'] for s in sugerencias], dry_run=dry_run)
        return resultados, escrituras, actualizar, revision

    def test_dry_run_no_escribe_nunca(self):
        """El default es simular: con dry_run no puede salir un solo PUT."""
        resultados, escrituras, _a, revision = self._aplicar([self.SUGERENCIA], dry_run=True)
        self.assertEqual(escrituras, [])
        revision.assert_not_called()
        self.assertEqual(resultados[0]['status'], 'dry_run')
        self.assertEqual(resultados[0]['previous_value'], 'Piedra Difusora')

    def test_aplicar_guarda_el_valor_anterior_leido_de_meli(self):
        """El "antes" sale de ML, no del cache: un rollback con datos viejos es peor."""
        item_en_meli = {'title': 'Titulo que quedo distinto en ML', 'category_id': 'MLA1'}
        resultados, escrituras, _a, revision = self._aplicar(
            [self.SUGERENCIA], dry_run=False, item=item_en_meli)

        self.assertEqual(len(escrituras), 1)
        self.assertEqual(resultados[0]['status'], 'applied')
        revision.assert_called_once()
        # El tercer argumento posicional es previous_value
        self.assertEqual(revision.call_args[0][2], 'Titulo que quedo distinto en ML')

    def test_revalida_antes_de_aplicar(self):
        """Alguien pudo editar el borrador a mano despues de generarlo."""
        editado = dict(self.SUGERENCIA, proposed_value='Escribinos por WhatsApp')
        resultados, escrituras, actualizar, _r = self._aplicar([editado], dry_run=False)

        self.assertEqual(escrituras, [])
        self.assertEqual(resultados[0]['status'], 'rejected')
        actualizar.assert_called_once()
        self.assertEqual(actualizar.call_args[1]['status'], 'failed')

    def test_un_fallo_no_interrumpe_los_demas(self):
        sugerencias = [
            dict(self.SUGERENCIA, id=1),
            dict(self.SUGERENCIA, id=2, proposed_value='corto'),
            dict(self.SUGERENCIA, id=3),
        ]
        resultados, escrituras, _a, _r = self._aplicar(sugerencias, dry_run=False)
        estados = [r['status'] for r in resultados]
        self.assertEqual(estados, ['applied', 'rejected', 'applied'])
        self.assertEqual(len(escrituras), 2)

    def test_no_reaplica_lo_ya_aplicado(self):
        ya = dict(self.SUGERENCIA, status='applied')
        resultados, escrituras, _a, _r = self._aplicar([ya], dry_run=False)
        self.assertEqual(escrituras, [])
        self.assertEqual(resultados[0]['status'], 'skipped')

    def test_un_error_de_meli_marca_el_borrador_como_fallido(self):
        resultados, _e, actualizar, revision = self._aplicar(
            [self.SUGERENCIA], dry_run=False,
            escribir_ok=False, escribir_error='HTTP 400: invalid title')
        self.assertEqual(resultados[0]['status'], 'error')
        self.assertIn('400', resultados[0]['error'])
        revision.assert_not_called()
        self.assertEqual(actualizar.call_args[1]['status'], 'failed')

    def test_sin_seleccion_no_hace_nada(self):
        self.assertEqual(aplicar.apply_suggestions([], dry_run=False), [])


class RollbackTest(unittest.TestCase):
    REVISION = {
        'id': 5, 'ml_id': 'MLA1', 'field': 'title',
        'previous_value': 'Piedra Difusora Chica Original',
        'applied_value': 'Piedra Difusora Chica Nueva', 'reverted_at': None,
    }

    def test_restaura_el_valor_anterior(self):
        escrituras = []
        with patch.object(aplicar.database, 'get_listing_revisions', return_value=[self.REVISION]), \
             patch.object(aplicar.database, 'mark_revision_reverted', return_value=True), \
             patch.object(aplicar, '_escribir',
                          side_effect=lambda *a: (escrituras.append(a), (True, None))[1]):
            resultados = aplicar.rollback_revisions([5])

        self.assertEqual(resultados[0]['status'], 'reverted')
        self.assertEqual(escrituras[0][2], 'Piedra Difusora Chica Original')

    def test_no_revierte_dos_veces(self):
        ya = dict(self.REVISION, reverted_at='2026-09-12 10:00:00')
        with patch.object(aplicar.database, 'get_listing_revisions', return_value=[ya]), \
             patch.object(aplicar, '_escribir') as escribir:
            resultados = aplicar.rollback_revisions([5])
        escribir.assert_not_called()
        self.assertEqual(resultados[0]['status'], 'skipped')


if __name__ == '__main__':
    unittest.main()
