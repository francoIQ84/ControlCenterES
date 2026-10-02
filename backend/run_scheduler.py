import os
import sys
import time

# Force process timezone to Argentina (Buenos Aires)
os.environ['TZ'] = 'America/Argentina/Buenos_Aires'
try:
    time.tzset()
except AttributeError:
    pass

# Ensure backend directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from src import database, scheduler

def main():
    print("[Scheduler Service] Inicializando base de datos...")
    try:
        database.init_db()
    except Exception as e:
        print(f"[Scheduler Service] Advertencia inicializando DB: {e}")

    print("[Scheduler Service] Iniciando daemon de tareas programadas...")
    scheduler.run_scheduler_daemon()

if __name__ == "__main__":
    main()
