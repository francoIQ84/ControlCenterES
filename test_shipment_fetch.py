import sys, requests
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import config, database, meli_api

t = config.get_access_token()
headers = {'Authorization': f'Bearer {t}'}

# Get recent orders from Mercado Libre
res = requests.get("https://api.mercadolibre.com/orders/search/recent?seller=155715452&limit=15", headers=headers)
print("Search Status:", res.status_code)
if res.status_code == 200:
    results = res.json().get('results', [])
    for o in results:
        order_id = o['id']
        buyer_name = o.get('buyer', {}).get('nickname')
        tags = o.get('tags', [])
        shipping = o.get('shipping') or {}
        ship_id = shipping.get('id')
        
        ship_status = 'unknown'
        if ship_id:
            s_res = requests.get(f"https://api.mercadolibre.com/shipments/{ship_id}", headers=headers)
            if s_res.status_code == 200:
                ship_status = s_res.json().get('status')
                
        print(f"Order #{order_id} | Buyer: {buyer_name} | Tags: {tags} | Ship ID: {ship_id} -> Status: {ship_status}")
