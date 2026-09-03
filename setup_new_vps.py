import os
import sys
import time
import socket
import paramiko

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

HOST = '144.91.80.88'
PORT = 22
USERNAME = 'root'
PASSWORD = 'Hidroponia26ab'

LOCAL_DIR = os.path.dirname(os.path.abspath(__file__))

def print_step(title):
    print("\n" + "=" * 60)
    print(f">> {title}")
    print("=" * 60)


def exec_cmd(ssh, cmd, step_name="", ignore_errors=False):
    if step_name:
        print(f"\n--- [CMD] {step_name} ---")
    print(f"$ {cmd}")
    
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    
    # Stream output
    output_lines = []
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line, end="")
        output_lines.append(line)
        
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0 and not ignore_errors:
        print(f"\n❌ Error en comando (código {exit_status})")
        raise RuntimeError(f"Command failed with status {exit_status}: {cmd}")
    return exit_status, "".join(output_lines)

def upload_directory(sftp, local_dir, remote_dir, exclude_dirs=None, exclude_exts=None):
    if exclude_dirs is None:
        exclude_dirs = {'.git', 'node_modules', '.next', '__pycache__', 'venv', '.turbo'}
    if exclude_exts is None:
        exclude_exts = {'.pyc', '.tsbuildinfo'}
        
    for root, dirs, files in os.walk(local_dir):
        # Filter out directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
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
            _, ext = os.path.splitext(f)
            if ext in exclude_exts:
                continue
            local_file = os.path.join(root, f)
            remote_file = os.path.join(target_dir, f).replace('\\', '/')
            sftp.put(local_file, remote_file)

def run_setup():
    print_step(f"Iniciando Conexion SSH con {HOST}:{PORT}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    # Wait for SSH if server recently rebooted
    connected = False
    for attempt in range(1, 10):
        try:
            print(f"Intento {attempt}/10 de conexion SSH...")
            ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=15)
            connected = True
            print("[OK] Conexion SSH establecida con exito.")
            break
        except Exception as e:
            print(f"No se pudo conectar ({e}). Reintentando en 5 segundos...")
            time.sleep(5)
            
    if not connected:
        print("[ERROR] No se pudo conectar al VPS por SSH.")
        sys.exit(1)

        
    try:
        # FASE 1: Verificación del SO
        print_step("FASE 1: Verificación del Sistema")
        exec_cmd(ssh, "uname -a && lsb_release -a", "Información del SO")
        exec_cmd(ssh, "free -h && df -h /", "Memoria y Disco")

        # FASE 2: Instalación de Paquetes Base y Dependencias
        print_step("FASE 2: Actualización e Instalación de Paquetes Base")
        exec_cmd(ssh, "export DEBIAN_FRONTEND=noninteractive && apt-get update -y", "Actualizar repositorios apt")
        
        print("\nInstalando paquetes base del sistema (Python, PostgreSQL, Nginx, FFmpeg, curl, git)...")
        exec_cmd(ssh, (
            "export DEBIAN_FRONTEND=noninteractive && "
            "apt-get install -y "
            "curl wget git ufw htop build-essential libpq-dev ffmpeg nginx "
            "certbot python3-certbot-nginx python3 python3-pip python3-venv python3-dev "
            "postgresql postgresql-contrib"
        ), "Instalación de paquetes apt")
        
        # Instalar Node.js 20 LTS vía NodeSource
        print_step("Instalando Node.js 20 LTS")
        exec_cmd(ssh, "node -v || true", "Verificar Node actual", ignore_errors=True)
        exec_cmd(ssh, (
            "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && "
            "export DEBIAN_FRONTEND=noninteractive && "
            "apt-get install -y nodejs"
        ), "Instalación de NodeSource Node.js 20")
        exec_cmd(ssh, "node -v && npm -v", "Comprobar versiones de Node y npm")

        # FASE 3: Configuración de PostgreSQL
        print_step("FASE 3: Configuración de PostgreSQL")
        exec_cmd(ssh, "systemctl enable postgresql && systemctl start postgresql", "Habilitar PostgreSQL")
        
        # Configurar password del usuario postgres y crear DB controlcenter
        psql_setup_cmds = (
            "sudo -u postgres psql -c \"ALTER USER postgres WITH PASSWORD 'Hidroponia26ab';\" && "
            "sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'controlcenter'\" | grep -q 1 || "
            "sudo -u postgres psql -c \"CREATE DATABASE controlcenter OWNER postgres;\" && "
            "sudo -u postgres psql -d controlcenter -c 'CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";' && "
            "sudo -u postgres psql -d controlcenter -c 'CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";'"
        )
        exec_cmd(ssh, psql_setup_cmds, "Inicialización de PostgreSQL y extensiones")

        # FASE 4: Estructura de Directorios
        print_step("FASE 4: Creación de Directorios del Proyecto")
        dirs_to_create = [
            "/var/www/controlcenter",
            "/var/www/controlcenter/backend",
            "/var/www/controlcenter/backend/src",
            "/var/www/controlcenter/backend/migrations",
            "/var/www/controlcenter/backend/tests",
            "/var/www/controlcenter/backend/whatsapp",
            "/var/www/controlcenter/admin",
            "/var/www/controlcenter/storefront",
            "/var/www/controlcenter/uploads",
            "/var/www/controlcenter/invoices",
            "/var/www/controlcenter/backups"
        ]
        exec_cmd(ssh, f"mkdir -p {' '.join(dirs_to_create)}", "Crear directorios en /var/www/controlcenter")

        # FASE 5: Transferencia de Archivos Backend, Frontend y Storefront
        print_step("FASE 5: Subida de Código Fuente y Activos")
        sftp = ssh.open_sftp()
        
        print("\n1. Subiendo archivos del backend...")
        backend_local = os.path.join(LOCAL_DIR, 'backend')
        backend_remote = '/var/www/controlcenter/backend'
        
        # Subir backend/src, migrations, tests, whatsapp
        for subfolder in ['src', 'migrations', 'tests', 'whatsapp']:
            local_sub = os.path.join(backend_local, subfolder)
            remote_sub = f"{backend_remote}/{subfolder}"
            if os.path.exists(local_sub):
                print(f"Subiendo {subfolder}...")
                upload_directory(sftp, local_sub, remote_sub)
                
        # Subir archivos sueltos de backend
        for f in ['main.py', 'requirements.txt']:
            src = os.path.join(backend_local, f)
            if os.path.exists(src):
                print(f"Subiendo backend/{f}...")
                sftp.put(src, f"{backend_remote}/{f}")

        # Subir README.md al root
        readme_path = os.path.join(LOCAL_DIR, 'README.md')
        if os.path.exists(readme_path):
            sftp.put(readme_path, '/var/www/controlcenter/README.md')

        print("\n2. Subiendo Frontend Admin compilado...")
        frontend_dist_local = os.path.join(LOCAL_DIR, 'frontend', 'dist')
        if os.path.exists(frontend_dist_local):
            upload_directory(sftp, frontend_dist_local, '/var/www/controlcenter/admin')
            print("[OK] Frontend Admin subido con exito.")
        else:
            print("[WARN] frontend/dist no existe localmente todavia.")

        print("\n3. Subiendo Storefront (Next.js)...")
        storefront_local = os.path.join(LOCAL_DIR, 'storefront')
        upload_directory(sftp, storefront_local, '/var/www/controlcenter/storefront')
        print("[OK] Storefront subido con exito.")
        
        sftp.close()

        # FASE 6: Entorno Virtual Python, Dependencias y Base de Datos
        print_step("FASE 6: Configuracion del Backend Python y Base de Datos")
        exec_cmd(ssh, "cd /var/www/controlcenter/backend && python3 -m venv venv", "Crear entorno virtual Python")
        exec_cmd(ssh, "/var/www/controlcenter/backend/venv/bin/pip install --upgrade pip", "Actualizar pip")
        exec_cmd(ssh, "/var/www/controlcenter/backend/venv/bin/pip install -r /var/www/controlcenter/backend/requirements.txt", "Instalar dependencias de requirements.txt")

        # Generar clave de encriptacion y escribir .env
        _, key_out = exec_cmd(
            ssh,
            "cd /var/www/controlcenter/backend && /var/www/controlcenter/backend/venv/bin/python -m src.utils.crypto --generate-key",
            "Generar CREDENTIALS_ENCRYPTION_KEY"
        )
        import re
        match = re.search(r'CREDENTIALS_ENCRYPTION_KEY=([^\s\r\n]+)', key_out)
        if match:
            encryption_key = match.group(1).strip()
        else:
            encryption_key = "u7M6x1Br5fNSdWTqgVjm4nP1uRNGaTk1iOneHdS8JaA="
        print(f"Clave de cifrado configurada: {encryption_key}")

        env_content = f"""DATABASE_URL=postgresql://postgres:Hidroponia26ab@localhost:5432/controlcenter
CREDENTIALS_ENCRYPTION_KEY={encryption_key}
TENANT_BASE_DOMAINS=controlcenter.app
TENANT_TRUST_HEADER=0
"""
        sftp = ssh.open_sftp()
        with sftp.open('/var/www/controlcenter/backend/.env', 'w') as f:
            f.write(env_content)
        sftp.close()
        print("[OK] Archivo /var/www/controlcenter/backend/.env creado.")

        # Inicializar base de datos y migraciones
        print_step("Inicializacion de Esquema de Base de Datos y Migraciones")
        exec_cmd(
            ssh,
            "sudo -u postgres psql -c \"DROP DATABASE IF EXISTS controlcenter;\" && "
            "sudo -u postgres psql -c \"CREATE DATABASE controlcenter OWNER postgres;\" && "
            "sudo -u postgres psql -d controlcenter -c 'CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";' && "
            "sudo -u postgres psql -d controlcenter -c 'CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";'",
            "Recrear base de datos controlcenter limpia"
        )
        exec_cmd(
            ssh,
            "cd /var/www/controlcenter/backend && /var/www/controlcenter/backend/venv/bin/python -c \"from src import database; database.init_db()\"",
            "Ejecutar init_db()"
        )
        exec_cmd(
            ssh,
            "cd /var/www/controlcenter/backend && /var/www/controlcenter/backend/venv/bin/python -m migrations.run_migration --apply",
            "Aplicar migraciones multi-tenant (001 a 005)"
        )

        # FASE 7: Dependencias de WhatsApp y Storefront
        print_step("FASE 7: Dependencias de WhatsApp y Compilacion de Storefront")
        exec_cmd(
            ssh,
            "cd /var/www/controlcenter/backend/whatsapp && npm install",
            "Instalar dependencias de WhatsApp Baileys"
        )
        exec_cmd(
            ssh,
            "cd /var/www/controlcenter/storefront && npm install",
            "Instalar dependencias de Storefront Next.js"
        )
        exec_cmd(
            ssh,
            "cd /var/www/controlcenter/storefront && npm run build",
            "Compilar Storefront Next.js para produccion"
        )

        # FASE 8: Configuración de Servicios Systemd
        print_step("FASE 8: Configuracion de Servicios Systemd")
        
        backend_service = """[Unit]
Description=ControlCenterES FastAPI Backend
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/controlcenter/backend
EnvironmentFile=/var/www/controlcenter/backend/.env
ExecStart=/var/www/controlcenter/backend/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
        storefront_service = """[Unit]
Description=ControlCenterES Next.js Storefront
After=network.target controlcenter-backend.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/controlcenter/storefront
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
"""
        whatsapp_service = """[Unit]
Description=ControlCenterES WhatsApp Bot Gateway
After=network.target controlcenter-backend.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/controlcenter/backend/whatsapp
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""
        sftp = ssh.open_sftp()
        with sftp.open('/etc/systemd/system/controlcenter-backend.service', 'w') as f:
            f.write(backend_service)
        with sftp.open('/etc/systemd/system/controlcenter-storefront.service', 'w') as f:
            f.write(storefront_service)
        with sftp.open('/etc/systemd/system/controlcenter-whatsapp.service', 'w') as f:
            f.write(whatsapp_service)
        sftp.close()
        print("[OK] Archivos .service de systemd creados.")

        exec_cmd(
            ssh,
            "systemctl daemon-reload && "
            "systemctl enable --now controlcenter-backend.service && "
            "systemctl enable --now controlcenter-storefront.service && "
            "systemctl enable --now controlcenter-whatsapp.service",
            "Recargar y habilitar servicios systemd"
        )

        # FASE 9: Configuración de Nginx
        print_step("FASE 9: Configuracion de Nginx Reverse Proxy")
        nginx_conf = """server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100M;

    # Frontend Admin
    location / {
        root /var/www/controlcenter/admin;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8090/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Static uploads & invoices
    location /uploads/ {
        alias /var/www/controlcenter/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    location /invoices/ {
        alias /var/www/controlcenter/backend/invoices/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
"""
        sftp = ssh.open_sftp()
        with sftp.open('/etc/nginx/sites-available/controlcenter', 'w') as f:
            f.write(nginx_conf)
        sftp.close()

        exec_cmd(
            ssh,
            "rm -f /etc/nginx/sites-enabled/default && "
            "ln -sf /etc/nginx/sites-available/controlcenter /etc/nginx/sites-enabled/ && "
            "nginx -t && systemctl reload nginx",
            "Habilitar sitio Nginx y recargar"
        )

        # FASE 10: Verificación Final
        print_step("FASE 10: Verificacion de Estado y Salud del Sistema")
        exec_cmd(ssh, "systemctl is-active controlcenter-backend.service", "Estado Backend")
        exec_cmd(ssh, "systemctl is-active controlcenter-storefront.service", "Estado Storefront")
        exec_cmd(ssh, "systemctl is-active controlcenter-whatsapp.service", "Estado WhatsApp")
        exec_cmd(ssh, "systemctl is-active nginx", "Estado Nginx")
        exec_cmd(ssh, "systemctl is-active postgresql", "Estado PostgreSQL")
        exec_cmd(ssh, "curl -sI http://127.0.0.1:8090/api/settings | head -n 5", "Test API Backend")
        exec_cmd(ssh, "curl -sI http://127.0.0.1:3000 | head -n 5", "Test Storefront SSR")

        print_step("[COMPLETADO] CONFIGURACION FINALIZADA CON EXITO")
        print(f"El sistema ControlCenterES esta 100% operativo en http://{HOST}")

    except Exception as e:
        print(f"\n[ERROR] Error durante la configuracion: {e}")
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    run_setup()
