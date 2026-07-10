import sys
import json
from src import database, config, meli_api

database.init_db()

# Load token explicitly if needed
# We can just use the meli_api.api_request
user_id = config.get_user_id()
print(f"User ID: {user_id}")

params = {
    'seller': user_id,
    'limit': 50,
    'offset': 0,
    'sort': 'date_desc',
    'order.date_created.from': '2022-01-01T00:00:00.000-00:00',
    'order.date_created.to': '2026-07-10T23:59:59.000-00:00'
}

response = meli_api.api_request("GET", "/orders/search", params=params)
if response:
    print(f"Status Code: {response.status_code}")
    data = response.json()
    print(f"Total results via paging: {data.get('paging', {}).get('total', 'Unknown')}")
    results = data.get('results', [])
    print(f"Results len: {len(results)}")
    
    # Try offset 200
    params['offset'] = 200
    res2 = meli_api.api_request("GET", "/orders/search", params=params)
    data2 = res2.json()
    print(f"Offset 200 Results len: {len(data2.get('results', []))}")
else:
    print("No response or demo mode.")
