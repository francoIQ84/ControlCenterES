import os
import sys
import json
from src import database, config, meli_api

database.init_db()

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
if response is not None:
    print(f"Status Code: {response.status_code}")
    try:
        data = response.json()
        print(f"Paging: {data.get('paging')}")
        results = data.get('results', [])
        print(f"Total results in this chunk: {len(results)}")
        if results:
            print(f"First order date: {results[0]['date_created']}")
            print(f"Last order date: {results[-1]['date_created']}")
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        print(response.text[:200])
else:
    print("No response from API. Probably demo mode.")
