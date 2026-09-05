import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('144.91.80.88', 22, 'root', 'Hidroponia26ab')
# Execute the SQL directly on the VPS database via a one-liner python script
python_script = """
import os, psycopg2
from dotenv import load_dotenv
load_dotenv('/var/www/controlcenter/backend/.env')
conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()
sql = open('/var/www/controlcenter/backend/migrations/007_fixed_expenses_paid.sql').read()
cur.execute(sql)
conn.commit()
print('Migration 007 applied on VPS')
"""
stdin, stdout, stderr = ssh.exec_command(f'/var/www/controlcenter/backend/venv/bin/python -c "{python_script}"')
print("STDOUT:", stdout.read().decode())
print("STDERR:", stderr.read().decode())
ssh.close()
