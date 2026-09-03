import paramiko

host = '144.91.80.88'
port = 22
username = 'root'
password = 'Hidroponia26ab'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, port, username, password)

print("Installing google dependencies...")
# The backend seems to run in a venv at /var/www/controlcenter/backend/venv
# Let's check by running pip install there.
stdin, stdout, stderr = ssh.exec_command("/var/www/controlcenter/backend/venv/bin/pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib")
print(stdout.read().decode())
print(stderr.read().decode())

ssh.close()
