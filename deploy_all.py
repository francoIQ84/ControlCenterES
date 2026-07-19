import paramiko
import os

host = '138.36.238.70'
port = 5196
username = 'root'
password = 'Hidroponia26!a'

local_backend_files = {
    'backend/src/database.py': '/var/www/controlcenter/backend/src/database.py',
    'backend/src/meli_api.py': '/var/www/controlcenter/backend/src/meli_api.py',
    'backend/src/progress.py': '/var/www/controlcenter/backend/src/progress.py',
    'backend/src/api/sales.py': '/var/www/controlcenter/backend/src/api/sales.py',
    'backend/src/api/media.py': '/var/www/controlcenter/backend/src/api/media.py',
    'backend/src/api/settings.py': '/var/www/controlcenter/backend/src/api/settings.py',
    'backend/src/api/__init__.py': '/var/www/controlcenter/backend/src/api/__init__.py',
    'backend/src/api/categories.py': '/var/www/controlcenter/backend/src/api/categories.py',
    'backend/src/api/inventory.py': '/var/www/controlcenter/backend/src/api/inventory.py',
    'backend/src/api/storefront.py': '/var/www/controlcenter/backend/src/api/storefront.py'
}

local_frontend_dist = 'frontend/dist'
remote_frontend_dir = '/var/www/controlcenter/admin'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    ssh.connect(host, port, username, password)
    sftp = ssh.open_sftp()
    
    # 1. Upload backend files
    print("Uploading backend files...")
    for local, remote in local_backend_files.items():
        print(f"Uploading {local} to {remote}...")
        sftp.put(local, remote)
        
    # 1.5 Upload storefront files
    print("Uploading storefront files...")
    sftp.put('storefront/src/app/page.tsx', '/var/www/controlcenter/storefront/src/app/page.tsx')
    sftp.put('storefront/src/app/layout.tsx', '/var/www/controlcenter/storefront/src/app/layout.tsx')
    sftp.put('storefront/src/app/favicon.ico', '/var/www/controlcenter/storefront/src/app/favicon.ico')
    
    # Ensure product/[id]/ remote path exists and upload details page
    try:
        sftp.mkdir('/var/www/controlcenter/storefront/src/app/product')
    except IOError:
        pass
    try:
        sftp.mkdir('/var/www/controlcenter/storefront/src/app/product/[id]')
    except IOError:
        pass
    sftp.put('storefront/src/app/product/[id]/page.tsx', '/var/www/controlcenter/storefront/src/app/product/[id]/page.tsx')
    
    # Upload public favicon
    try:
        sftp.mkdir('/var/www/controlcenter/storefront/public')
    except IOError:
        pass
    sftp.put('storefront/public/favicon.ico', '/var/www/controlcenter/storefront/public/favicon.ico')
    
    # Upload components
    sftp.put('storefront/src/components/ProductImageGallery.tsx', '/var/www/controlcenter/storefront/src/components/ProductImageGallery.tsx')
        
    # 2. Upload frontend built assets
    print("\nUploading frontend built assets...")
    
    # Clean remote assets first to prevent leftover chunk files
    try:
        print("Cleaning remote assets folder...")
        stdin, stdout, stderr = ssh.exec_command(f"rm -rf {remote_frontend_dir}/assets/*")
        stdout.read() # wait for completion
    except Exception as e:
        print("Could not clean remote assets:", e)

    # Walk local dist and upload
    for root, dirs, files in os.walk(local_frontend_dist):
        for d in dirs:
            local_dir_path = os.path.join(root, d)
            rel_path = os.path.relpath(local_dir_path, local_frontend_dist)
            remote_dir_path = os.path.join(remote_frontend_dir, rel_path).replace('\\', '/')
            try:
                sftp.mkdir(remote_dir_path)
                print(f"Created remote dir: {remote_dir_path}")
            except IOError:
                # Dir already exists or error
                pass
                
        for f in files:
            local_file_path = os.path.join(root, f)
            rel_path = os.path.relpath(local_file_path, local_frontend_dist)
            remote_file_path = os.path.join(remote_frontend_dir, rel_path).replace('\\', '/')
            print(f"Uploading {local_file_path} to {remote_file_path}...")
            sftp.put(local_file_path, remote_file_path)
            
    sftp.close()
    print("\nFile upload completed successfully!")
    
    # 3. Build storefront on VPS
    print("\nBuilding storefront on VPS...")
    stdin, stdout, stderr = ssh.exec_command("cd /var/www/controlcenter/storefront && npm run build")
    output_str = stdout.read().decode('utf-8', errors='replace')
    print(output_str.encode('ascii', errors='replace').decode('ascii'))
    
    # 4. Restart storefront service
    print("\nRestarting controlcenter-storefront service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart controlcenter-storefront.service")
    err_sf = stderr.read().decode()
    if err_sf:
        print("Storefront restart error:", err_sf)
    else:
        print("Storefront service restarted successfully!")
        
    # 5. Restart backend service
    print("\nRestarting controlcenter-backend service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart controlcenter-backend.service")
    err = stderr.read().decode()
    if err:
        print("Backend restart error:", err)
    else:
        print("Backend service restarted successfully!")
        
    # Check statuses
    print("\nChecking backend service status...")
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active controlcenter-backend.service")
    print("Backend Active Status:", stdout.read().decode().strip())
    
    print("\nChecking storefront service status...")
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active controlcenter-storefront.service")
    print("Storefront Active Status:", stdout.read().decode().strip())
    
finally:
    ssh.close()
