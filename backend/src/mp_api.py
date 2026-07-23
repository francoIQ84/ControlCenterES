import time
import requests
import json
from datetime import datetime, timedelta
from src import config, database, meli_api

API_BASE_URL = "https://api.mercadopago.com"

def sync_mp_payments(date_from=None, limit=2000):
    """
    Fetches approved payments from Mercado Pago API using pagination, maps standalone MP payments 
    (transfers, QR, Point, Links) to orders_cache, registers buyer info into customers table, 
    extracts fee_details into variable_expenses for ALL payments (including MeLi sales),
    and handles automatic inventory stock deduction if products/items are specified.
    """
    if meli_api.is_demo_mode():
        return True, 0

    access_token = config.get_access_token()
    if not access_token:
        return False, "No hay token de acceso configurado."

    meli_api.check_and_refresh_token()
    access_token = config.get_access_token()

    offset = 0
    limit_per_page = 50
    max_records = limit if limit else 2000
    synced_count = 0

    try:
        while True:
            url = f"{API_BASE_URL}/v1/payments/search"
            headers = {
                'Authorization': f"Bearer {access_token}",
                'Accept': 'application/json'
            }

            params = {
                'sort': 'date_created',
                'criteria': 'desc',
                'limit': limit_per_page,
                'offset': offset
            }
            if date_from:
                params['begin_date'] = date_from

            response = requests.get(url, headers=headers, params=params, timeout=15)
            if response.status_code != 200:
                return False, f"Error Mercado Pago API ({response.status_code}): {response.text}"

            res_data = response.json()
            results = res_data.get('results', [])
            if not results:
                break

            orders_list = []

            for p in results:
                payment_status = p.get('status')
                if payment_status != 'approved':
                    continue

                payment_id = p.get('id')
                date_created = p.get('date_created', '')
                total_amount = float(p.get('transaction_amount', 0.0))
                currency_id = p.get('currency_id', 'ARS')
                payment_type = p.get('payment_type_id', '')
                payment_method_id = p.get('payment_method_id', '')
                operation_type = p.get('operation_type', '')
                order_info = p.get('order') or {}

                # Fee details extraction (Commissions & Retentions for ALL payments)
                fee_details = p.get('fee_details', [])
                total_fee = 0.0
                for fee in fee_details:
                    fee_amount = float(fee.get('amount', 0.0))
                    total_fee += fee_amount
                    fee_type = fee.get('type', 'mercadopago_fee')
                    
                    cat = 'Comisión Mercado Pago'
                    if 'tax' in str(fee_type).lower() or 'retention' in str(fee_type).lower():
                        cat = 'Impuestos / Retenciones MP'

                    fee_date = date_created[:10] if len(date_created) >= 10 else datetime.now().strftime('%Y-%m-%d')
                    fee_desc = f"Comisión MP Pago #{payment_id} ({fee_type})"
                    database.save_auto_mp_expense(fee_date, fee_desc, fee_amount, cat, payment_id)

                # Check if this payment belongs to a Mercado Libre order
                if order_info.get('type') == 'mercadolibre':
                    # Update fee_amount on existing MeLi order if found
                    meli_order_id = order_info.get('id') or p.get('external_reference')
                    if meli_order_id:
                        with database.get_connection() as conn:
                            with conn.cursor() as cursor:
                                cursor.execute("""
                                    UPDATE orders_cache 
                                    SET mp_payment_id = %s, mp_fee_amount = %s 
                                    WHERE order_id = %s OR order_id = %s
                                """, (payment_id, total_fee, meli_order_id, str(meli_order_id)))
                    continue  # Do not create duplicate order row for MeLi sale

                # Determine platform subtype for standalone Mercado Pago transactions
                source_platform = 'MERCADOPAGO'
                if payment_type == 'bank_transfer' or payment_method_id in ['pix', 'cvu', 'account_money'] or operation_type == 'money_transfer':
                    source_platform = 'MERCADOPAGO_TRANSFER'
                elif 'pos' in operation_type or 'point' in operation_type or payment_type == 'ticket':
                    source_platform = 'MERCADOPAGO_QR'
                elif operation_type == 'regular_payment':
                    source_platform = 'MERCADOPAGO_LINK'

                payment_method_label = f"{payment_method_id} ({payment_type})".upper()

                # Payer details
                payer = p.get('payer') or {}
                buyer_id = payer.get('id') or (int(payment_id) if str(payment_id).isdigit() else 999000)
                email = payer.get('email', '')
                first_name = payer.get('first_name', '')
                last_name = payer.get('last_name', '')
                full_name = f"{first_name} {last_name}".strip() or email.split('@')[0] or f"Cliente MP #{payment_id}"
                
                identification = payer.get('identification') or {}
                doc_type = identification.get('type', 'DNI')
                doc_num = str(identification.get('number', ''))

                # Extract items / inventory matching
                additional_info = p.get('additional_info') or {}
                items_raw = additional_info.get('items') or []
                
                items_formatted = []
                cost_amount = 0.0
                inventory_linked = 1

                if items_raw:
                    for it in items_raw:
                        title = it.get('title', 'Producto Mercado Pago')
                        unit_price = float(it.get('unit_price', total_amount))
                        qty = int(it.get('quantity', 1))
                        item_id = it.get('id') or p.get('external_reference') or ''

                        matched_prod = None
                        if item_id:
                            matched_prod = database.get_product_by_id(item_id)
                        
                        if not matched_prod and title:
                            with database.get_connection() as conn:
                                with conn.cursor() as cursor:
                                    cursor.execute("SELECT ml_id, title, cost_price FROM products_cache WHERE LOWER(title) = LOWER(%s) LIMIT 1", (title,))
                                    matched_prod = cursor.fetchone()

                        if matched_prod:
                            prod_cost = float(matched_prod.get('cost_price', 0.0))
                            cost_amount += (prod_cost * qty)
                            items_formatted.append({
                                'item_id': matched_prod['ml_id'],
                                'title': matched_prod['title'],
                                'quantity': qty,
                                'unit_price': unit_price,
                                'thumbnail': matched_prod.get('thumbnail', '')
                            })
                        else:
                            items_formatted.append({
                                'item_id': item_id or f"MP-{payment_id}",
                                'title': title,
                                'quantity': qty,
                                'unit_price': unit_price,
                                'thumbnail': ''
                            })
                else:
                    desc = p.get('description') or f"Cobro MP ({payment_method_label})"
                    items_formatted.append({
                        'item_id': f"MP-{payment_id}",
                        'title': desc,
                        'quantity': 1,
                        'unit_price': total_amount,
                        'thumbnail': ''
                    })
                    inventory_linked = 0

                order_data = {
                    'order_id': payment_id,
                    'date_created': date_created,
                    'buyer': {
                        'id': buyer_id,
                        'nickname': email or f"user_{buyer_id}",
                        'name': full_name,
                        'email': email,
                        'phone': payer.get('phone', {}).get('number', '') if isinstance(payer.get('phone'), dict) else '',
                        'document_type': doc_type,
                        'document_number': doc_num,
                        'address': '',
                    },
                    'total_amount': total_amount,
                    'currency_id': currency_id,
                    'status': 'paid',
                    'payment_status': 'approved',
                    'shipping_status': 'delivered',
                    'items': items_formatted,
                    'source_platform': source_platform,
                    'payment_method': payment_method_label,
                    'mp_payment_id': payment_id,
                    'mp_fee_amount': total_fee,
                    'inventory_linked': inventory_linked,
                    'cost_amount': cost_amount
                }

                orders_list.append(order_data)
                synced_count += 1

            if orders_list:
                database.save_orders_and_customers(orders_list)

            offset += limit_per_page
            total_count = res_data.get('paging', {}).get('total', 0)
            if offset >= total_count or synced_count >= max_records:
                break

        # Part 2: Sync Outgoing Payments / Purchases / Transfers Sent (where merchant is the payer)
        user_id = config.get_user_id()
        if user_id:
            try:
                offset_p = 0
                while True:
                    url_p = f"{API_BASE_URL}/v1/payments/search"
                    params_p = {
                        'payer.id': user_id,
                        'sort': 'date_created',
                        'criteria': 'desc',
                        'limit': 50,
                        'offset': offset_p
                    }
                    if date_from:
                        params_p['begin_date'] = date_from

                    resp_p = requests.get(url_p, headers=headers, params=params_p, timeout=15)
                    if resp_p.status_code == 200:
                        res_p_data = resp_p.json()
                        p_results = res_p_data.get('results', [])
                        if not p_results:
                            break

                        for p in p_results:
                            if p.get('status') != 'approved':
                                continue
                            
                            payment_id = p.get('id')
                            date_created = p.get('date_created', '')
                            total_amount = float(p.get('transaction_amount', 0.0))
                            op_type = p.get('operation_type', '')
                            desc = p.get('description') or ''

                            fee_date = date_created[:10] if len(date_created) >= 10 else datetime.now().strftime('%Y-%m-%d')

                            # Determine category for outgoing payment/transfer
                            if op_type == 'money_transfer':
                                cat = 'Transferencias Salientes MP'
                                fee_desc = f"Transferencia enviada #{payment_id}: {desc or 'Varios'}"
                            else:
                                cat = 'Compras / Insumos MP'
                                fee_desc = f"Compra MP #{payment_id}: {desc or 'Pago a proveedor/servicio'}"

                            database.save_auto_mp_expense(fee_date, fee_desc, total_amount, cat, payment_id)

                        offset_p += 50
                        p_total = res_p_data.get('paging', {}).get('total', 0)
                        if offset_p >= p_total or offset_p >= max_records:
                            break
                    else:
                        break
            except Exception as e_p:
                print(f"[Warning] Sync outgoing MP payments error: {e_p}")

        return True, synced_count

    except Exception as e:
        return False, f"Excepción de conexión Mercado Pago: {str(e)}"

def get_mp_balance():
    """
    Returns account balance (total, available, unreleased) from Mercado Pago.
    """
    if meli_api.is_demo_mode():
        return {
            'total_amount': 485000.0,
            'available_balance': 412000.0,
            'unavailable_balance': 73000.0,
            'currency_id': 'ARS'
        }

    access_token = config.get_access_token()
    user_id = config.get_user_id()
    if not access_token or not user_id:
        return None

    meli_api.check_and_refresh_token()
    access_token = config.get_access_token()

    url = f"{API_BASE_URL}/users/{user_id}/mercadopago_account/balance"
    headers = {
        'Authorization': f"Bearer {access_token}",
        'Accept': 'application/json'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return {
                'total_amount': float(data.get('total_amount', 0.0)),
                'available_balance': float(data.get('available_balance', 0.0)),
                'unavailable_balance': float(data.get('unavailable_balance', 0.0)),
                'currency_id': data.get('currency_id', 'ARS')
            }
        else:
            print(f"[MP Balance] Error {response.status_code}: {response.text}")
            return None
    except Exception as e:
        print(f"[MP Balance] Excepción: {e}")
        return None
