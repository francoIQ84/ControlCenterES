"""
Tests del aislamiento en disco (src/tenancy.tenant_storage_dir y src/api/media).

El aislamiento por RLS cubre la base de datos y nada más. Los archivos subidos,
las imágenes que genera la IA, los reels, las facturas y los presupuestos viven
en el sistema de archivos, donde PostgreSQL no llega: hasta ahora todos los
negocios compartían una carpeta por tipo.

No hay base de datos acá: sólo se fija el ContextVar del tenant y se mira qué
rutas salen.
"""

import os
import shutil
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

# El entorno de desarrollo no tiene salida a internet para instalar
# dependencias, asi que se stubea lo unico que falta en la cadena de imports.
try:  # pragma: no cover - depende del entorno
    import dotenv  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _dotenv_stub = types.ModuleType('dotenv')
    _dotenv_stub.load_dotenv = lambda *args, **kwargs: False
    sys.modules['dotenv'] = _dotenv_stub

from src import tenancy

OTRO_TENANT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

# `src.api.media` arrastra todo el paquete `src.api`, y el endpoint de subida
# declara File(...), que necesita `python-multipart`. En un entorno sin esa
# dependencia los tests del explorador se saltean en lugar de dar un error que
# no dice nada del código. Los de `tenant_storage_dir` corren siempre: sólo
# dependen de la stdlib.
try:  # pragma: no cover - depende del entorno
    from src.api import media as media_module
    MEDIA_IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover
    media_module = None
    MEDIA_IMPORT_ERROR = f"{type(exc).__name__}: {exc}".splitlines()[0]


class TenantStorageDirTest(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp(prefix="cc-storage-")
        self.addCleanup(shutil.rmtree, self.base, ignore_errors=True)

    def test_el_maestro_se_queda_en_la_raiz(self):
        """No se migra a una subcarpeta a propósito: sus rutas ya están
        escritas en products_cache, web_config y blog_posts."""
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            ruta = tenancy.tenant_storage_dir(self.base, "reels")
        self.assertEqual(Path(ruta), Path(self.base) / "reels")

    def test_otro_inquilino_va_a_su_propia_carpeta(self):
        with tenancy.tenant_context(OTRO_TENANT):
            ruta = tenancy.tenant_storage_dir(self.base, "reels")
        self.assertEqual(Path(ruta),
                         Path(self.base) / tenancy.TENANT_MEDIA_SUBDIR / OTRO_TENANT / "reels")

    def test_dos_inquilinos_no_comparten_carpeta(self):
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            a = tenancy.tenant_storage_dir(self.base, "ai_listing")
        with tenancy.tenant_context(OTRO_TENANT):
            b = tenancy.tenant_storage_dir(self.base, "ai_listing")
        self.assertNotEqual(Path(a), Path(b))

    def test_crea_el_directorio(self):
        with tenancy.tenant_context(OTRO_TENANT):
            ruta = tenancy.tenant_storage_dir(self.base, "social_cache")
        self.assertTrue(os.path.isdir(ruta))

    def test_create_false_no_toca_el_disco(self):
        with tenancy.tenant_context(OTRO_TENANT):
            ruta = tenancy.tenant_storage_dir(self.base, "nada", create=False)
        self.assertFalse(os.path.exists(ruta))

    def test_url_publica_del_maestro(self):
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            self.assertEqual(tenancy.tenant_media_url("reels"), "/uploads/reels")

    def test_url_publica_de_otro_inquilino(self):
        with tenancy.tenant_context(OTRO_TENANT):
            self.assertEqual(
                tenancy.tenant_media_url("reels"),
                f"/uploads/t/{OTRO_TENANT}/reels")


@unittest.skipIf(media_module is None,
                 f"src.api.media no importable en este entorno ({MEDIA_IMPORT_ERROR})")
class MediaSafePathTest(unittest.TestCase):
    """El explorador de archivos no puede salirse del espacio de su inquilino."""

    def setUp(self):
        media = media_module
        self.media = media
        self.base = Path(tempfile.mkdtemp(prefix="cc-uploads-")).resolve()
        self.addCleanup(shutil.rmtree, self.base, ignore_errors=True)
        patcher = patch.object(media, "UPLOAD_DIR", self.base)
        self.addCleanup(patcher.stop)
        patcher.start()

    def test_la_raiz_del_maestro_es_uploads(self):
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            self.assertEqual(self.media.get_tenant_root(), self.base)

    def test_otro_inquilino_tiene_su_raiz(self):
        with tenancy.tenant_context(OTRO_TENANT):
            root = self.media.get_tenant_root()
        self.assertEqual(root, (self.base / "t" / OTRO_TENANT).resolve())

    def test_no_se_puede_escapar_con_punto_punto(self):
        """Con la validación anterior —contra `uploads/` y por prefijo de
        texto— un `../` llevaba a la carpeta de otro negocio y pasaba."""
        from fastapi import HTTPException
        with tenancy.tenant_context(OTRO_TENANT):
            with self.assertRaises(HTTPException) as ctx:
                self.media.get_safe_path("../../otro-negocio")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_ruta_normal_resuelve_dentro_del_inquilino(self):
        with tenancy.tenant_context(OTRO_TENANT):
            ruta = self.media.get_safe_path("fotos/producto.jpg")
            root = self.media.get_tenant_root()
        self.assertEqual(ruta, root / "fotos" / "producto.jpg")

    def test_la_url_publica_incluye_el_prefijo_del_inquilino(self):
        with tenancy.tenant_context(OTRO_TENANT):
            ruta = self.media.get_safe_path("foto.png")
            url = self.media.to_public_url(ruta)
        self.assertEqual(url, f"/uploads/t/{OTRO_TENANT}/foto.png")

    def test_el_maestro_no_ve_la_carpeta_de_los_inquilinos(self):
        """`uploads/t` guarda el material de los clientes. Si apareciera en el
        listado, el Maestro podría abrirla, moverla o borrarla."""
        (self.base / "t" / OTRO_TENANT).mkdir(parents=True)
        (self.base / "propia").mkdir()
        with tenancy.tenant_context(tenancy.MASTER_TENANT_ID):
            listado = self.media.list_media("")
        nombres = [d["name"] for d in listado["directories"]]
        self.assertIn("propia", nombres)
        self.assertNotIn("t", nombres)


if __name__ == "__main__":
    unittest.main()
