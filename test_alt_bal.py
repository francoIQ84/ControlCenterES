import sys, requests
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import config, meli_api, mp_api

t = config.get_access_token()
user_id = config.get_user_id()

endpoints = [
    f"https://api.mercadopago.com/users/{user_id}/mercadopago_account/balance",
    f"https://api.mercadopago.com/users/me/mercadopago_account/balance",
    f"https://api.mercadolibre.com/users/{user_id}/mercadopago_account/balance",
    f"https://api.mercadopago.com/users/{user_id}/balance",
    f"https://api.mercadopago.com/v1/account/balance",
    f"https://api.mercadolibre.com/users/{user_id}/balance",
    f"https://api.mercadopago.com/mercadopago_account/balance",
]

headers = {'Authorization': f'Bearer {t}', 'Accept': 'application/json'}

for ep in endpoints:
    res = requests.get(ep, headers=headers)
    print(f"URL: {ep} -> Status: {res.status_code} | Body: {res.text[:150]}")
