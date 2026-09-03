import os
import sys
import time
from datetime import datetime
import paramiko

HOST = '144.91.80.88'
PORT = 22
USERNAME = 'root'
PASSWORD = 'Hidroponia26ab'
REMOTE_TEMP_DIR = '/tmp'
LOCAL_BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backups')

def progress_callback(transferred, total):
    percent = (transferred / total) * 100 if total > 0 else 0
    mb_transferred = transferred / (1024 * 1024)
    mb_total = total / (1024 * 1024)
    sys.stdout.write(f"\r[Descarga] {percent:.1f}% ({mb_transferred:.2f} MB / {mb_total:.2f} MB)")
    sys.stdout.flush()

def run_db_backup():
    os.makedirs(LOCAL_BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    remote_dump_filename = f"db_backup_vps_{timestamp}.sql.gz"
    remote_dump_path = f"{REMOTE_TEMP_DIR}/{remote_dump_filename}"
    local_dump_path = os.path.join(LOCAL_BACKUP_DIR, remote_dump_filename)

    print(f"=== Conectando al VPS {HOST}:{PORT} como {USERNAME} ===")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=30)
        print("✓ Conexión SSH establecida con éxito.")

        # 1. Identificar base de datos y generar volcado comprimido
        # Intentamos ver si hay .env en /var/www/controlcenter/backend/.env o usamos la db por defecto 'controlcenter'
        print("\n--- Ejecutando pg_dump en el VPS ---")
        
        # Leemos el DATABASE_URL del .env del servidor si existe
        cmd_check = "if [ -f /var/www/controlcenter/backend/.env ]; then grep DATABASE_URL /var/www/controlcenter/backend/.env; fi"
        stdin, stdout, stderr = ssh.exec_command(cmd_check)
        db_url_line = stdout.read().decode().strip()
        
        if db_url_line and "=" in db_url_line:
            db_url = db_url_line.split("=", 1)[1].strip().strip('"').strip("'")
            print(f"Encontrado DATABASE_URL en .env remoto.")
            dump_cmd = f"pg_dump \"{db_url}\" | gzip > {remote_dump_path}"
        else:
            print("Usando usuario 'postgres' local para pg_dump de la base 'controlcenter'...")
            dump_cmd = f"sudo -u postgres pg_dump controlcenter | gzip > {remote_dump_path}"

        print(f"Comando de volcado: {dump_cmd}")
        t0 = time.time()
        stdin, stdout, stderr = ssh.exec_command(dump_cmd)
        exit_status = stdout.channel.recv_exit_status()
        err = stderr.read().decode()

        if exit_status != 0:
            print(f"Error al ejecutar pg_dump (código {exit_status}):\n{err}")
            # Fallback intentando directo como usuario postgres
            fallback_cmd = f"su - postgres -c 'pg_dump controlcenter' | gzip > {remote_dump_path}"
            print(f"Reintentando con fallback: {fallback_cmd}")
            stdin, stdout, stderr = ssh.exec_command(fallback_cmd)
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                raise Exception(f"Fallo el volcado: {stderr.read().decode()}")

        print(f"✓ Volcado generado en el VPS en {time.time() - t0:.2f}s.")

        # Obtener tamaño del dump en el servidor
        stdin, stdout, stderr = ssh.exec_command(f"ls -lh {remote_dump_path}")
        size_info = stdout.read().decode().strip()
        print(f"Detalle remoto: {size_info}")

        # 2. Descargar el archivo vía SFTP
        print(f"\n--- Descargando archivo a tu PC local ---")
        print(f"Destino local: {local_dump_path}")
        sftp = ssh.open_sftp()
        t1 = time.time()
        sftp.get(remote_dump_path, local_dump_path, callback=progress_callback)
        sftp.close()
        print(f"\n✓ Descarga completada en {time.time() - t1:.2f}s.")

        # 3. Limpiar archivo temporal en el servidor
        print("\n--- Limpiando archivo temporal en el VPS ---")
        ssh.exec_command(f"rm -f {remote_dump_path}")
        print("✓ Archivo temporal remoto eliminado.")

        # 4. Verificar archivo local
        local_size = os.path.getsize(local_dump_path)
        print(f"\n========================================================")
        print(f"🎉 BACKUP EXITOSO")
        print(f"Archivo local: {local_dump_path}")
        print(f"Tamaño: {local_size / (1024 * 1024):.2f} MB ({local_size:,} bytes)")
        print(f"========================================================")

    except Exception as e:
        print(f"\n❌ Error durante el proceso de backup: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    run_db_backup()
