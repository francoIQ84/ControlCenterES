import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('138.36.238.70', 5196, 'root', 'Hidroponia26!a')

script = """
import os

conf_path = '/etc/nginx/sites-enabled/controlcenter'
if not os.path.exists(conf_path):
    print("Nginx config file not found!")
    exit(1)

with open(conf_path, 'r') as f:
    content = f.read()

target = '''    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }'''

replacement = '''    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }'''

if target in content:
    content = content.replace(target, replacement)
    with open(conf_path, 'w') as f:
        f.write(content)
    print("Nginx config updated successfully!")
    
    # Test nginx and restart
    import subprocess
    test_res = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    print("Nginx -t stdout:", test_res.stdout)
    print("Nginx -t stderr:", test_res.stderr)
    
    if test_res.returncode == 0:
        reload_res = subprocess.run(['systemctl', 'reload', 'nginx'], capture_output=True, text=True)
        print("Nginx reload stdout:", reload_res.stdout)
        print("Nginx reload stderr:", reload_res.stderr)
    else:
        print("Nginx configuration check failed, not reloading!")
else:
    print("Target block not found in Nginx config! Current location / content might be different.")
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/update_nginx.py', 'w') as f:
    f.write(script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command('python3 /tmp/update_nginx.py')
print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
