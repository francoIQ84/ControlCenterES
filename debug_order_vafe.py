import sys, requests
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import config, database, meli_api

t = config.get_access_token()
headers = {'Authorization': f'Bearer {t}'}

with database.get_connection() as conn:
    with conn.cursor() as c:
        c.execute("SELECT order_id, date_created, buyer_nickname, buyer_name, shipping_status, shipping_msg_sent FROM orders_cache WHERE buyer_nickname LIKE '%VAFE9371366%' OR buyer_name LIKE '%VAFE9371366%'")
        rows = c.fetchall()
        print("=== DATABASE ROWS FOR VAFE9371366 ===")
        for r in rows:
            order_id = r['order_id']
            print(f"Order ID: {order_id} | DB Status: {r['shipping_status']} | Msg Sent: {r['shipping_msg_sent']}")

            # Fetch order from MeLi API
            res = requests.get(f"https://api.mercadolibre.com/orders/{order_id}", headers=headers)
            print("MeLi Order API Status Code:", res.status_code)
            if res.status_code == 200:
                data = res.json()
                print("Order Tags:", data.get('tags'))
                shipping = data.get('shipping') or {}
                ship_id = shipping.get('id')
                print("Shipping ID:", ship_id)
                if ship_id:
                    s_res = requests.get(f"https://api.mercadolibre.com/shipments/{ship_id}", headers=headers)
                    print("Shipment API Status Code:", s_res.status_code)
                    if s_res.status_code == 200:
                        s_data = s_res.json()
                        print("Shipment STATUS:", s_data.get('status'))
                        print("Shipment SUBSTATUS:", s_data.get('substatus'))
                        print("Shipment Full Data:", s_data)
