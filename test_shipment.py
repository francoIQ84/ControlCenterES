import sys, requests
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import config, meli_api

t = config.get_access_token()
headers = {'Authorization': f'Bearer {t}'}

# Search order by id
order_id = "2000014135057151"
res = requests.get(f"https://api.mercadolibre.com/orders/{order_id}", headers=headers)
print("Order Status Code:", res.status_code)
if res.status_code == 200:
    data = res.json()
    print("Tags:", data.get('tags'))
    print("Status:", data.get('status'))
    shipping = data.get('shipping')
    print("Shipping object:", shipping)
    if shipping and shipping.get('id'):
        ship_id = shipping['id']
        res_ship = requests.get(f"https://api.mercadolibre.com/shipments/{ship_id}", headers=headers)
        print("Shipment Status Code:", res_ship.status_code)
        if res_ship.status_code == 200:
            ship_data = res_ship.json()
            print("Shipment Status:", ship_data.get('status'))
            print("Shipment Substatus:", ship_data.get('substatus'))
