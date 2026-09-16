import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('144.91.80.88', 22, 'root', 'Hidroponia26ab')

sftp = ssh.open_sftp()
sftp.put('backend/migrations/013_user_audit_attribution.sql', '/var/www/controlcenter/backend/migrations/013_user_audit_attribution.sql')

remote_script_content = """import os, psycopg2
from dotenv import load_dotenv
load_dotenv('/var/www/controlcenter/backend/.env')
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
with open('/var/www/controlcenter/backend/migrations/013_user_audit_attribution.sql') as f:
    sql = f.read()
cur.execute(sql)
conn.commit()

cur.execute("SELECT column_name, table_name FROM information_schema.columns WHERE column_name IN ('created_by_user', 'updated_by_user');")
cols = cur.fetchall()
print('Migration 013 applied on VPS. Columns verified:', cols)
"""

with sftp.open('/var/www/controlcenter/backend/apply_migration_013.py', 'w') as f:
    f.write(remote_script_content)

sftp.close()

stdin, stdout, stderr = ssh.exec_command('/var/www/controlcenter/backend/venv/bin/python /var/www/controlcenter/backend/apply_migration_013.py')
out = stdout.read().decode()
err = stderr.read().decode()
print("STDOUT:", out)
print("STDERR:", err)

# Remove temporary script
ssh.exec_command('rm -f /var/www/controlcenter/backend/apply_migration_013.py')
ssh.close()
