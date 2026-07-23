import sys, json
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import database, config
import requests

with database.get_connection() as conn:
    with conn.cursor() as c:
        c.execute("SELECT * FROM orders_cache WHERE buyer_name LIKE '%Fernando%' OR buyer_nickname LIKE '%Vazquez%' OR order_id::text LIKE '%200001%'")
        rows = c.fetchall()
        for r in rows:
            print("DB Order ID:", r['order_id'], "| Buyer:", r.get('buyer_name'), "| Shipping Status:", r.get('shipping_status'))
            t = config.get_access_token()
            headers = {'Authorization': f'Bearer {t}'}
            res = requests.get(f"https://api.mercadolibre.com/orders/{r['order_id']}", headers=headers)
            print("MeLi API Order Status:", res.status_code)
            if res.status_code == 200:
                data = res.json()
                print("Order Tags:", data.get('tags'))
                shipping = data.get('shipping') or {}
                ship_id = shipping.get('id')
                print("Shipping ID:", ship_id)
                if ship_id:
                    res_ship = requests.get(f"https://api.mercadolibre.com/shipments/{ship_id}", headers=headers)
                    if res_ship.status_code == 200:
                        sdata = res_ship.json()
                        print("Shipment STATUS:", sdata.get('status'), "| SUBSTATUS:", sdata.get('substatus'))
