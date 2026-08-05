from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from src import database
from src.api.auth import get_current_user

router = APIRouter()

class FixedExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    month: int
    year: int

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
                "INSERT INTO fixed_expenses (description, amount, category, month, year) VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (expense.description, expense.amount, expense.category, expense.month, expense.year)
            )
            return cursor.fetchone()

@router.put("/fixed/{expense_id}")
def update_fixed_expense(expense_id: int, expense: FixedExpenseCreate, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE fixed_expenses 
                   SET description = %s, amount = %s, category = %s, month = %s, year = %s 
                   WHERE id = %s RETURNING *""",
                (expense.description, expense.amount, expense.category, expense.month, expense.year, expense_id)
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
