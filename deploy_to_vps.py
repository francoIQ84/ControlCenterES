import os
import sys
import time
import paramiko

HOST = '144.91.80.88'
PORT = 22
USERNAME = 'root'
PASSWORD = 'Hidroponia26ab'

LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def upload_directory(sftp, local_dir, remote_dir, ignore_dirs=None):
    if ignore_dirs is None:
        ignore_dirs = {'__pycache__', '.pytest_cache', 'node_modules', '.git'}
        
    for root, dirs, files in os.walk(local_dir):
        # Filter out directories to ignore
        dirs[:] = [d for d in dirs if d not in ignore_dirs]
        
        rel_dir = os.path.relpath(root, local_dir)
        if rel_dir == '.':
            target_dir = remote_dir
        else:
            target_dir = os.path.join(remote_dir, rel_dir).replace('\\', '/')
            
        try:
            sftp.mkdir(target_dir)
        except IOError:
            pass
            
        for f in files:
            if f.endswith('.pyc'):
                continue
            local_file = os.path.join(root, f)
            remote_file = os.path.join(target_dir, f).replace('\\', '/')
            print(f"  -> {remote_file}")
            sftp.put(local_file, remote_file)

def main():
    print(f"=== Conectando al VPS {HOST}:{PORT} ===")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=20)
    print("[OK] Conexión SSH establecida")

    sftp = ssh.open_sftp()

    # 1. Limpiar assets antiguos del frontend en el VPS
    print("\n1. Limpiando assets antiguos de /var/www/controlcenter/admin/assets/...")
    stdin, stdout, stderr = ssh.exec_command("rm -rf /var/www/controlcenter/admin/assets/*")
    stdout.read()
    print("[OK] Assets antiguos limpiados")

    # 2. Subir nuevo build del Frontend (dist/)
    print("\n2. Subiendo nuevo Frontend Admin compilado (frontend/dist)...")
    frontend_dist = os.path.join(LOCAL_DIR, 'frontend', 'dist')
    upload_directory(sftp, frontend_dist, '/var/www/controlcenter/admin')
    print("[OK] Frontend subido exitosamente")

    # 3. Subir Backend (src/ y migrations/)
    print("\n3. Subiendo código Backend (src/ y migrations/)...")
    backend_src = os.path.join(LOCAL_DIR, 'backend', 'src')
    backend_migrations = os.path.join(LOCAL_DIR, 'backend', 'migrations')
    upload_directory(sftp, backend_src, '/var/www/controlcenter/backend/src')
    upload_directory(sftp, backend_migrations, '/var/www/controlcenter/backend/migrations')
    print("[OK] Backend subido exitosamente")
    sftp.close()

    # Las migraciones NO se aplican desde aca a proposito: correrlas en cada
    # deploy pisaba configuracion editada desde el panel (la 010 reescribia
    # mp_excluded_emails con valores fijos en cada despliegue). Los archivos
    # .sql se suben igual en el paso 3; aplicalos a mano cuando corresponda:
    #   ssh root@144.91.80.88
    #   su - postgres -c "psql -d controlcenter -f /var/www/controlcenter/backend/migrations/0XX_nombre.sql"

    # 4. Ajustar permisos de archivos en el VPS
    print("\n4. Ajustando permisos en /var/www/controlcenter...")
    cmd_perms = (
        "chown -R www-data:www-data /var/www/controlcenter/admin && "
        "chmod -R 755 /var/www/controlcenter/admin && "
        "chown -R root:root /var/www/controlcenter/backend"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd_perms)
    stdout.read()
    print("[OK] Permisos aplicados")

    # 5. Reiniciar backend service
    print("\n5. Reiniciando servicio de backend...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart controlcenter-backend.service")
    stdout.read()
    time.sleep(2)
    print("[OK] Servicio backend reiniciado")

    # 6. Recargar Nginx
    print("\n6. Recargando Nginx...")
    stdin, stdout, stderr = ssh.exec_command("nginx -t && systemctl reload nginx")
    out = stdout.read().decode()
    err = stderr.read().decode()
    if "successful" in err or "successful" in out:
        print("[OK] Nginx recargado correctamente")
    else:
        print(f"Nginx output: {out}\n{err}")

    # 7. Verificar servicios
    print("\n7. Verificando estado de los servicios...")
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active controlcenter-backend.service controlcenter-storefront.service nginx")
    status = stdout.read().decode().strip().split()
    print(f"Backend: {status[0] if len(status) > 0 else 'unknown'}")
    print(f"Storefront: {status[1] if len(status) > 1 else 'unknown'}")
    print(f"Nginx: {status[2] if len(status) > 2 else 'unknown'}")

    # 8. Verificación de index.html servido
    print("\n8. Verificando index.html en el VPS...")
    stdin, stdout, stderr = ssh.exec_command("cat /var/www/controlcenter/admin/index.html")
    index_content = stdout.read().decode()
    print("Contenido index.html en VPS:")
    print(index_content.strip())

    # 9. Verificación de logs recientes del backend
    print("\n9. Últimos logs del backend...")
    stdin, stdout, stderr = ssh.exec_command("journalctl -u controlcenter-backend.service -n 15 --no-pager")
    print(stdout.read().decode().strip())

    ssh.close()
    print("\n=== ¡Despliegue a la VPS completado con éxito! ===")

if __name__ == '__main__':
    main()
