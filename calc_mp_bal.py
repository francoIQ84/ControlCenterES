import sys
sys.path.insert(0, '/var/www/controlcenter/backend')
from src import database

with database.get_connection() as conn:
    with conn.cursor() as c:
        # Sum incoming MP sales
        c.execute("""
            SELECT COALESCE(SUM(total_amount), 0) as total_sales
            FROM orders_cache 
            WHERE source_platform LIKE 'MERCADOPAGO%'
        """)
        total_sales = float(c.fetchone()['total_sales'])

        # Sum MP fees and outgoing expenses
        c.execute("""
            SELECT COALESCE(SUM(amount), 0) as total_expenses
            FROM variable_expenses 
            WHERE category LIKE '%MP%' OR description LIKE '%MP%'
        """)
        total_expenses = float(c.fetchone()['total_expenses'])

        net_balance = total_sales - total_expenses

        print(f"Total MP Sales: ${total_sales:,.2f}")
        print(f"Total MP Expenses & Fees: ${total_expenses:,.2f}")
        print(f"Calculated MP Net Balance: ${net_balance:,.2f}")
