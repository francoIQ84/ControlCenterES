import paramiko
import sys

HOST = '144.91.80.88'
PORT = 22
USERNAME = 'root'
PASSWORD = 'Hidroponia26ab'

def exec_cmd(ssh, cmd):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)
    while True:
        line = stdout.readline()
        if not line:
            break
        print(line, end="")
    status = stdout.channel.recv_exit_status()
    print(f"[Status: {status}]")
    return status

def setup():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USERNAME, password=PASSWORD, timeout=15)
    
    # 1. Write comprehensive Nginx config with both domains
    nginx_conf = """# 1. Admin Panel & API Backend
server {
    listen 80;
    listen [::]:80;
    server_name admin.hidroponiarosario.com admin.hidroponiarosario.com.ar;

    client_max_body_size 100M;

    location / {
        root /var/www/controlcenter/admin;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

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

# 2. Public Storefront (Next.js)
server {
    listen 80;
    listen [::]:80;
    server_name hidroponiarosario.com www.hidroponiarosario.com hidroponiarosario.com.ar www.hidroponiarosario.com.ar;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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

    location /uploads/ {
        alias /var/www/controlcenter/backend/uploads/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}

# 3. Default fallback for IP direct access
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100M;

    location / {
        root /var/www/controlcenter/admin;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8090/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /var/www/controlcenter/backend/uploads/;
    }
}
"""
    sftp = ssh.open_sftp()
    with sftp.open('/etc/nginx/sites-available/controlcenter', 'w') as f:
        f.write(nginx_conf)
    sftp.close()
    
    exec_cmd(ssh, "nginx -t && systemctl reload nginx")
    
    # 2. Run Certbot to generate SSL certificates for all domains
    exec_cmd(ssh, (
        "certbot --nginx "
        "-d hidroponiarosario.com -d www.hidroponiarosario.com -d admin.hidroponiarosario.com "
        "-d hidroponiarosario.com.ar -d www.hidroponiarosario.com.ar -d admin.hidroponiarosario.com.ar "
        "--expand --non-interactive --agree-tos --register-unsafely-without-email --redirect"
    ))
    
    exec_cmd(ssh, "systemctl reload nginx")
    ssh.close()
    print("\n[OK] SSL y Dominios configurados con exito!")

if __name__ == '__main__':
    setup()
