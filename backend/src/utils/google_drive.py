import os
from typing import Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/drive.file']

def upload_file(file_path: str, filename: str, folder_id: str, service_account_info: dict) -> Optional[str]:
    """
    Subir un archivo a Google Drive usando una cuenta de servicio.
    :param file_path: Ruta local del archivo a subir.
    :param filename: Nombre que tendrá el archivo en Drive.
    :param folder_id: ID de la carpeta en Drive donde se subirá.
    :param service_account_info: Diccionario con el JSON de la service account de GCP.
    :return: El ID del archivo subido en Drive, o None si ocurre un error.
    """
    try:
        credentials = service_account.Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES
        )
        service = build('drive', 'v3', credentials=credentials)

        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        # Determine mimetype
        mime_type = 'application/zip' if file_path.endswith('.zip') else 'application/octet-stream'

        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
        
        uploaded_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id'
        ).execute()
        
        return uploaded_file.get('id')
    except Exception as e:
        print(f"[Google Drive API] Error uploading file '{filename}': {e}")
        return None
