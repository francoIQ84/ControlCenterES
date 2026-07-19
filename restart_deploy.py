import paramiko

host = '138.36.238.70'
port = 5196
username = 'root'
password = 'Hidroponia26!a'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(host, port, username, password)
    
    print("Restarting backend service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart controlcenter-backend.service")
    err = stderr.read().decode()
    if err:
        print("Error:", err)
    else:
        print("Service restarted successfully!")
        
    print("\nService Status:")
    stdin, stdout, stderr = ssh.exec_command("systemctl status controlcenter-backend.service --no-pager | head -n 10")
    print(stdout.read().decode())
    
finally:
    ssh.close()
