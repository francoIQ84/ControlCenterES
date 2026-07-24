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

@router.get("/fixed")
def get_fixed_expenses(month: Optional[int] = None, year: Optional[int] = None, current_user: dict = Depends(get_current_user)):
    query = "SELECT * FROM fixed_expenses"
    params = []
    if month and year:
        query += " WHERE month = %s AND year = %s"
        params.extend([month, year])
    query += " ORDER BY created_at DESC"
    
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, tuple(params))
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

@router.delete("/variable/{expense_id}")
def delete_variable_expense(expense_id: int, current_user: dict = Depends(get_current_user)):
    with database.get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM variable_expenses WHERE id = %s RETURNING id", (expense_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Expense not found")
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
        with conn.cursor() as cursor:
            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM fixed_expenses WHERE month = %s AND year = %s", (month, year))
            total_fixed = float(cursor.fetchone()['total'])

            cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM variable_expenses WHERE EXTRACT(MONTH FROM date) = %s AND EXTRACT(YEAR FROM date) = %s", (month, year))
            total_variable = float(cursor.fetchone()['total'])

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
                "total_expenses": total_expenses,
                "net_balance": net_balance,
                "margin_pct": round(margin_pct, 2)
            }
