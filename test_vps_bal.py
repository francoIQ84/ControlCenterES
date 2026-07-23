import sys, requests
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import config, meli_api, mp_api

t = config.get_access_token()
user_id = config.get_user_id()
print("User ID:", user_id)

url = f"https://api.mercadopago.com/users/{user_id}/mercadopago_account/balance"
headers = {'Authorization': f'Bearer {t}', 'Accept': 'application/json'}
res = requests.get(url, headers=headers)
print("HTTP Status:", res.status_code)
print("Raw Response Body:", res.text)
