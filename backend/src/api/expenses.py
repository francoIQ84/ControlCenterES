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
