from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, date, timedelta
from pydantic import BaseModel
from src import database
from src.api.auth import get_current_user

router = APIRouter()

class ServicePaymentCreate(BaseModel):
    description: str
    category: str
    amount: float
    due_date: str
    period_month: int
    period_year: int
    payment_link: Optional[str] = ""
    payment_code: Optional[str] = ""
    auto_recurring: Optional[bool] = True

class ServicePaymentPayRequest(BaseModel):
    add_to_variable_expenses: Optional[bool] = True
    paid_date: Optional[str] = None

class FixedExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    month: int
    year: int
    is_paid: Optional[bool] = False

class VariableExpenseCreate(BaseModel):
    date: str
    description: str
    amount: float
    category: str

class IncomeCreate(BaseModel):
    date: str
    description: str
    amount: float
    category: str

def ensure_fixed_expenses_for_month(conn, month: int, year: int):
    """
    Ensures fixed expenses exist for the specified month and year.
    If no fixed expenses exist for (month, year), automatically copies 
    the fixed expenses from the most recent prior month.
    Also migrates any legacy rows with NULL month/year to July 2026 (7, 2026).
    """
    with conn.cursor() as cursor:
        # Migrate legacy rows that have NULL month/year to July 2026 (7, 2026)
        cursor.execute("UPDATE fixed_expenses SET month = 7, year = 2026 WHERE month IS NULL OR year IS NULL")
        
        # Check if records already exist for the requested month/year
        cursor.execute("SELECT COUNT(*) as count FROM fixed_expenses WHERE month = %s AND year = %s", (month, year))
        row = cursor.fetchone()
        count = row['count'] if row else 0
        
        if count > 0:
            return  # Already populated
            
        # Find the latest month/year prior to (year, month) that has fixed expenses
        cursor.execute(
            """
            SELECT month, year 
            FROM fixed_expenses 
            WHERE (year < %s OR (year = %s AND month < %s))
            ORDER BY year DESC, month DESC 
            LIMIT 1
            """,
            (year, year, month)
        )
        prev = cursor.fetchone()
        
        if not prev:
            # If no prior month exists before target, check if any month exists at all
            cursor.execute(
                """
                SELECT month, year 
                FROM fixed_expenses 
                ORDER BY year ASC, month ASC 
                LIMIT 1
                """
            )
            prev = cursor.fetchone()
            
        if prev:
            prev_m = prev['month']
            prev_y = prev['year']
            # Fetch fixed expenses from that base month
            cursor.execute(
                "SELECT description, amount, category FROM fixed_expenses WHERE month = %s AND year = %s",
                (prev_m, prev_y)
            )
            prev_expenses = cursor.fetchall()
            
            for exp in prev_expenses:
                cursor.execute(
                    "INSERT INTO fixed_expenses (description, amount, category, month, year) VALUES (%s, %s, %s, %s, %s)",
                    (exp['description'], exp['amount'], exp['category'], month, year)
                )

@router.get("/fixed")
def get_fixed_expenses(month: Optional[int] = None, year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        if month and year:
            ensure_fixed_expenses_for_month(conn, month, year)
            
        query = "SELECT * FROM fixed_expenses"
        params = []
        if month and year:
            query += " WHERE month = %s AND year = %s"
            params.extend([month, year])
        query += " ORDER BY id ASC"
        
        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
            return cursor.fetchall()

@router.post("/fixed/copy-previous")
def copy_previous_fixed_expenses(month: int = Query(...), year: int = Query(...), current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT month, year 
                FROM fixed_expenses 
                WHERE (year < %s OR (year = %s AND month < %s))
                ORDER BY year DESC, month DESC 
                LIMIT 1
                """,
                (year, year, month)
            )
            prev = cursor.fetchone()
            if not prev:
                raise HTTPException(status_code=400, detail="No hay gastos fijos de meses anteriores para copiar.")
            
            # Clear target month to re-copy
            cursor.execute("DELETE FROM fixed_expenses WHERE month = %s AND year = %s", (month, year))
            
            cursor.execute(
                "SELECT description, amount, category FROM fixed_expenses WHERE month = %s AND year = %s",
                (prev['month'], prev['year'])
            )
            prev_expenses = cursor.fetchall()
            for exp in prev_expenses:
                cursor.execute(
                    "INSERT INTO fixed_expenses (description, amount, category, month, year) VALUES (%s, %s, %s, %s, %s)",
                    (exp['description'], exp['amount'], exp['category'], month, year)
                )
            
            cursor.execute("SELECT * FROM fixed_expenses WHERE month = %s AND year = %s ORDER BY id ASC", (month, year))
            return cursor.fetchall()

@router.post("/fixed")
def create_fixed_expense(expense: FixedExpenseCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO fixed_expenses (description, amount, category, month, year, is_paid) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
                (expense.description, expense.amount, expense.category, expense.month, expense.year, expense.is_paid)
            )
            return cursor.fetchone()

@router.put("/fixed/{expense_id}")
def update_fixed_expense(expense_id: int, expense: FixedExpenseCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE fixed_expenses 
                   SET description = %s, amount = %s, category = %s, month = %s, year = %s, is_paid = %s
                   WHERE id = %s RETURNING *""",
                (expense.description, expense.amount, expense.category, expense.month, expense.year, expense.is_paid, expense_id)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Expense not found")
            return row

@router.delete("/fixed/{expense_id}")
def delete_fixed_expense(expense_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM fixed_expenses WHERE id = %s RETURNING id", (expense_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Expense not found")
            return {"success": True}

@router.get("/variable")
def get_variable_expenses(month: Optional[str] = None, year: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    # By default fetch all, or filter by month/year if provided
    query = "SELECT * FROM variable_expenses"
    params = []
    
    if month and year:
        # Date is stored as DATE (YYYY-MM-DD)
        # We can extract month and year in postgres
        query += " WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s"
        params.extend([month, year])
        
    query += " ORDER BY date DESC, created_at DESC"
    
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
            # Format dates to string for JSON serialization
            rows = cursor.fetchall()
            for r in rows:
                if r.get('date'):
                    r['date'] = r['date'].strftime('%Y-%m-%d')
            return rows

@router.post("/variable")
def create_variable_expense(expense: VariableExpenseCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO variable_expenses (date, description, amount, category) VALUES (%s, %s, %s, %s) RETURNING *",
                (expense.date, expense.description, expense.amount, expense.category)
            )
            row = cursor.fetchone()
            if row and row.get('date'):
                row['date'] = row['date'].strftime('%Y-%m-%d')
            return row

@router.put("/variable/{expense_id}")
def update_variable_expense(expense_id: int, expense: VariableExpenseCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE variable_expenses 
                   SET date = %s, description = %s, amount = %s, category = %s 
                   WHERE id = %s RETURNING *""",
                (expense.date, expense.description, expense.amount, expense.category, expense_id)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Expense not found")
            if row.get('date'):
                row['date'] = row['date'].strftime('%Y-%m-%d')
            return row

@router.delete("/variable/{expense_id}")
def delete_variable_expense(expense_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM variable_expenses WHERE id = %s RETURNING id, mp_payment_id", (expense_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Expense not found")
            if row.get('mp_payment_id'):
                cursor.execute("INSERT INTO deleted_mp_expenses (mp_payment_id) VALUES (%s) ON CONFLICT DO NOTHING", (row['mp_payment_id'],))
            return {"success": True}

@router.get("/incomes")
def get_incomes(month: Optional[str] = None, year: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = "SELECT * FROM incomes"
    params = []
    
    if month and year:
        query += " WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s"
        params.extend([month, year])
        
    query += " ORDER BY date DESC, created_at DESC"
    
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            for r in rows:
                if r.get('date'):
                    r['date'] = r['date'].strftime('%Y-%m-%d')
            return rows

@router.post("/incomes")
def create_income(income: IncomeCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO incomes (date, description, amount, category) VALUES (%s, %s, %s, %s) RETURNING *",
                (income.date, income.description, income.amount, income.category)
            )
            row = cursor.fetchone()
            if row and row.get('date'):
                row['date'] = row['date'].strftime('%Y-%m-%d')
            return row

@router.put("/incomes/{income_id}")
def update_income(income_id: int, income: IncomeCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE incomes 
                   SET date = %s, description = %s, amount = %s, category = %s 
                   WHERE id = %s RETURNING *""",
                (income.date, income.description, income.amount, income.category, income_id)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Income not found")
            if row.get('date'):
                row['date'] = row['date'].strftime('%Y-%m-%d')
            return row

@router.delete("/incomes/{income_id}")
def delete_income(income_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM incomes WHERE id = %s RETURNING id", (income_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Income not found")
            return {"success": True}

@router.get("/summary")
def get_financial_summary(month: int, year: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        ensure_fixed_expenses_for_month(conn, month, year)
        with conn.cursor() as cursor:
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses WHERE month = %s AND year = %s", (month, year))
            total_fixed = float(cursor.fetchone()['total'])

            # Variable expenses excluding transfers/card payments (money movements, not real expenses)
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM variable_expenses WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s AND category NOT IN ('Transferencias Salientes MP', 'Pago de Tarjeta MP')",
                (month, year)
            )
            total_variable = float(cursor.fetchone()['total'])

            # Transfers/card payments tracked separately for transparency
            cursor.execute(
                "SELECT COALESCE(SUM(amount), 0) as total FROM variable_expenses WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s AND category IN ('Transferencias Salientes MP', 'Pago de Tarjeta MP')",
                (month, year)
            )
            total_transfers = float(cursor.fetchone()['total'])

            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM incomes WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s", (month, year))
            total_manual_incomes = float(cursor.fetchone()['total'])

            cursor.execute("""
                SELECT COALESCE(SUM(total_amount), 0) as total 
                FROM orders_cache 
                WHERE EXTRACT(MONTH FROM date_created::timestamp) = %s 
                  AND EXTRACT(YEAR FROM date_created::timestamp) = %s 
                  AND LOWER(status) NOT IN ('cancelled', 'cancelado')
            """, (month, year))
            total_sales = float(cursor.fetchone()['total'])

            total_incomes = total_sales + total_manual_incomes
            total_expenses = total_fixed + total_variable
            net_balance = total_incomes - total_expenses
            margin_pct = (net_balance / total_incomes * 100) if total_incomes > 0 else 0

            return {
                "month": month,
                "year": year,
                "total_sales": total_sales,
                "total_manual_incomes": total_manual_incomes,
                "total_incomes": total_incomes,
                "total_fixed_expenses": total_fixed,
                "total_variable_expenses": total_variable,
                "total_transfers": total_transfers,
                "total_expenses": total_expenses,
                "net_balance": net_balance,
                "margin_pct": round(margin_pct, 2)
            }

@router.get("/sales")
def get_expenses_sales(month: int, year: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT order_id, date_created, buyer_name, buyer_nickname, total_amount, 
                       source_platform, payment_method, status
                FROM orders_cache 
                WHERE EXTRACT(MONTH FROM date_created::timestamp) = %s 
                  AND EXTRACT(YEAR FROM date_created::timestamp) = %s 
                  AND LOWER(status) NOT IN ('cancelled', 'cancelado')
                ORDER BY date_created DESC
            """, (month, year))
            rows = cursor.fetchall()
            for r in rows:
                if r.get('date_created'):
                    r['date_created'] = str(r['date_created'])[:19].replace('T', ' ')
            return rows

def ensure_service_payments_for_month(conn, month: int, year: int):
    with conn.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) as count FROM service_payments WHERE period_month = %s AND period_year = %s", (month, year))
        row = cursor.fetchone()
        count = row['count'] if row else 0
        
        if count > 0:
            return
            
        cursor.execute(
            """
            SELECT period_month, period_year 
            FROM service_payments 
            WHERE (period_year < %s OR (period_year = %s AND period_month < %s))
              AND auto_recurring = TRUE
            ORDER BY period_year DESC, period_month DESC 
            LIMIT 1
            """,
            (year, year, month)
        )
        prev = cursor.fetchone()
        if prev:
            cursor.execute(
                """
                SELECT description, category, amount, due_date, payment_link, payment_code, auto_recurring 
                FROM service_payments 
                WHERE period_month = %s AND period_year = %s AND auto_recurring = TRUE
                """,
                (prev['period_month'], prev['period_year'])
            )
            prev_services = cursor.fetchall()
            import calendar
            for s in prev_services:
                prev_due = s['due_date']
                day = prev_due.day if prev_due and hasattr(prev_due, 'day') else 10
                last_day = calendar.monthrange(year, month)[1]
                new_due_date = date(year, month, min(day, last_day))
                
                cursor.execute(
                    """
                    INSERT INTO service_payments 
                    (description, category, amount, due_date, period_month, period_year, status, payment_link, payment_code, auto_recurring)
                    VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s)
                    """,
                    (s['description'], s['category'], s['amount'], new_due_date.strftime('%Y-%m-%d'), month, year, s['payment_link'], s['payment_code'], s['auto_recurring'])
                )

@router.get("/vencimientos")
def get_service_payments(month: Optional[int] = None, year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        if month and year:
            ensure_service_payments_for_month(conn, month, year)
            
        query = "SELECT * FROM service_payments"
        params = []
        if month and year:
            query += " WHERE period_month = %s AND period_year = %s"
            params.extend([month, year])
        query += " ORDER BY due_date ASC, id ASC"
        
        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            today_str = date.today().strftime('%Y-%m-%d')
            for r in rows:
                if r.get('due_date'):
                    d_str = r['due_date'].strftime('%Y-%m-%d') if hasattr(r['due_date'], 'strftime') else str(r['due_date'])
                    r['due_date'] = d_str
                    if r.get('status') == 'pending' and d_str < today_str:
                        r['status'] = 'overdue'
                if r.get('paid_date'):
                    r['paid_date'] = r['paid_date'].strftime('%Y-%m-%d %H:%M:%S') if hasattr(r['paid_date'], 'strftime') else str(r['paid_date'])
            return rows

@router.post("/vencimientos")
def create_service_payment(sp: ServicePaymentCreate, current_user: dict = Depends(get_current_user)):
    today_str = date.today().strftime('%Y-%m-%d')
    initial_status = 'pending'
    if sp.due_date < today_str:
        initial_status = 'overdue'
        
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO service_payments 
                (description, category, amount, due_date, period_month, period_year, status, payment_link, payment_code, auto_recurring)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (sp.description, sp.category, sp.amount, sp.due_date, sp.period_month, sp.period_year, initial_status, sp.payment_link or '', sp.payment_code or '', sp.auto_recurring if sp.auto_recurring is not None else True)
            )
            row = cursor.fetchone()
            if row and row.get('due_date'):
                row['due_date'] = row['due_date'].strftime('%Y-%m-%d') if hasattr(row['due_date'], 'strftime') else str(row['due_date'])
            return row

@router.put("/vencimientos/{sp_id}")
def update_service_payment(sp_id: int, sp: ServicePaymentCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE service_payments 
                SET description = %s, category = %s, amount = %s, due_date = %s, 
                    period_month = %s, period_year = %s, payment_link = %s, payment_code = %s, auto_recurring = %s
                WHERE id = %s RETURNING *
                """,
                (sp.description, sp.category, sp.amount, sp.due_date, sp.period_month, sp.period_year, sp.payment_link or '', sp.payment_code or '', sp.auto_recurring if sp.auto_recurring is not None else True, sp_id)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
            if row.get('due_date'):
                row['due_date'] = row['due_date'].strftime('%Y-%m-%d') if hasattr(row['due_date'], 'strftime') else str(row['due_date'])
            return row

@router.delete("/vencimientos/{sp_id}")
def delete_service_payment(sp_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM service_payments WHERE id = %s RETURNING id", (sp_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
            return {"success": True}

@router.post("/vencimientos/{sp_id}/pay")
def pay_service_payment(sp_id: int, req: ServicePaymentPayRequest, current_user: dict = Depends(get_current_user)):
    paid_timestamp = req.paid_date or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    paid_date_only = paid_timestamp.split(' ')[0]
    
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE service_payments 
                SET status = 'paid', paid_date = %s 
                WHERE id = %s RETURNING *
                """,
                (paid_timestamp, sp_id)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
            
            if req.add_to_variable_expenses:
                cursor.execute(
                    """
                    INSERT INTO variable_expenses (date, description, amount, category)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (paid_date_only, f"Pago Servicio: {row['description']}", row['amount'], row['category'] or 'Servicios')
                )
            
            if row.get('due_date'):
                row['due_date'] = row['due_date'].strftime('%Y-%m-%d') if hasattr(row['due_date'], 'strftime') else str(row['due_date'])
            if row.get('paid_date'):
                row['paid_date'] = str(row['paid_date'])
            return row

@router.post("/vencimientos/{sp_id}/unpay")
def unpay_service_payment(sp_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE service_payments 
                SET status = 'pending', paid_date = NULL 
                WHERE id = %s RETURNING *
                """,
                (sp_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Vencimiento no encontrado")
            return row

class TestAlertReq(BaseModel):
    phone: str

@router.post("/vencimientos/test-alert")
def test_vencimiento_alert(req: TestAlertReq, current_user: dict = Depends(get_current_user)):
    import requests
    phone = req.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Número de teléfono es requerido")
        
    msg = "🔴 *ALERTA DE PRUEBA - ControlCenterES*\n\n" \
          "📌 *Servicio:* Luz Edenor (Ejemplo)\n" \
          "🏷️ *Categoría:* Servicios\n" \
          "💰 *Monto:* $45.000,00\n" \
          "📅 *Fecha Vencimiento:* 2026-08-25\n\n" \
          "👉 *Pagar ahora:* https://mpago.la/demo\n" \
          "📋 *Código de pago:* `0382918392183`\n\n" \
          "_Este es un mensaje de prueba del sistema de Alertas de Vencimientos._"

    try:
        res = requests.post("http://127.0.0.1:8091/send-broadcast", json={
            "recipients": [{"phone": phone, "name": "Administrador"}],
            "message": msg,
            "delaySeconds": 1
        }, timeout=10)
        if res.status_code == 200:
            return {"success": True, "message": f"Alerta enviada correctamente a {phone}"}
        else:
            raise HTTPException(status_code=400, detail=f"Error al enviar mensaje WhatsApp: {res.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error de conexión con servicio WhatsApp: {str(e)}")

@router.get("/forecast")
def get_cashflow_forecast(current_user: dict = Depends(get_current_user)):
    from datetime import datetime, date, timedelta
    import calendar

    now = datetime.now()
    cur_m = now.month
    cur_y = now.year

    with database.get_connection() as conn:
        ensure_fixed_expenses_for_month(conn, cur_m, cur_y)
        with conn.cursor() as cursor:
            # 1. Total sales in last 30 days
            cursor.execute("""
                SELECT COALESCE(SUM(total_amount), 0) as total 
                FROM orders_cache 
                WHERE date_created::timestamp >= NOW() - INTERVAL '30 days'
                  AND LOWER(status) NOT IN ('cancelled', 'cancelado')
            """)
            sales_30d = float(cursor.fetchone()['total'])
            avg_daily_sales = sales_30d / 30.0
            projected_monthly_sales = avg_daily_sales * 30.0

            # 2. Manual incomes monthly average
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM incomes WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s", (cur_m, cur_y))
            manual_incomes = float(cursor.fetchone()['total'])
            projected_incomes = projected_monthly_sales + manual_incomes

            # 3. Fixed expenses
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses WHERE month = %s AND year = %s", (cur_m, cur_y))
            total_fixed = float(cursor.fetchone()['total'])

            # 4. Pending service payments
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM service_payments WHERE period_month = %s AND period_year = %s AND status IN ('pending', 'overdue')", (cur_m, cur_y))
            pending_vencimientos = float(cursor.fetchone()['total'])

            # 5. Variable expenses 3-month average
            cursor.execute("""
                SELECT COALESCE(SUM(amount), 0) / 3.0 as total 
                FROM variable_expenses 
                WHERE date >= NOW() - INTERVAL '90 days'
                  AND category NOT IN ('Transferencias Salientes MP', 'Pago de Tarjeta MP')
            """)
            avg_variable = float(cursor.fetchone()['total'])

            projected_expenses = total_fixed + pending_vencimientos + avg_variable
            projected_net = projected_incomes - projected_expenses

            # Current net balance
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses WHERE month = %s AND year = %s", (cur_m, cur_y))
            # Current summary net balance
            cur_summary = get_financial_summary(cur_m, cur_y, current_user=current_user)
            current_balance = cur_summary.get('net_balance', 0.0)

            # Month + 1 calculation
            m1_num = cur_m + 1 if cur_m < 12 else 1
            y1_num = cur_y if cur_m < 12 else cur_y + 1
            m1_name = calendar.month_name[m1_num]
            try:
                m1_name = date(y1_num, m1_num, 1).strftime('%B').capitalize()
            except Exception:
                pass

            m1_balance = current_balance + projected_net

            # Month + 2 calculation
            m2_num = m1_num + 1 if m1_num < 12 else 1
            y2_num = y1_num if m1_num < 12 else y1_num + 1
            m2_name = calendar.month_name[m2_num]
            try:
                m2_name = date(y2_num, m2_num, 1).strftime('%B').capitalize()
            except Exception:
                pass

            m2_balance = m1_balance + projected_net

            return {
                "current_balance": current_balance,
                "avg_daily_sales": round(avg_daily_sales, 2),
                "projected_monthly_sales": round(projected_monthly_sales, 2),
                "projected_incomes": round(projected_incomes, 2),
                "projected_expenses": round(projected_expenses, 2),
                "projected_net_monthly": round(projected_net, 2),
                "month_1": {
                    "month_number": m1_num,
                    "year": y1_num,
                    "month_name": m1_name,
                    "projected_incomes": round(projected_incomes, 2),
                    "projected_expenses": round(projected_expenses, 2),
                    "projected_net": round(projected_net, 2),
                    "estimated_ending_balance": round(m1_balance, 2),
                    "status": "healthy" if m1_balance >= 0 else "risk"
                },
                "month_2": {
                    "month_number": m2_num,
                    "year": y2_num,
                    "month_name": m2_name,
                    "projected_incomes": round(projected_incomes, 2),
                    "projected_expenses": round(projected_expenses, 2),
                    "projected_net": round(projected_net, 2),
                    "estimated_ending_balance": round(m2_balance, 2),
                    "status": "healthy" if m2_balance >= 0 else "risk"
                }
            }


