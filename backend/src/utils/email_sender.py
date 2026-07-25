import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from src import database

def send_smtp_email(to_email: str, subject: str, html_content: str, pdf_url: str = None) -> tuple[bool, str]:
    """
    Sends an email using the SMTP settings configured in the database.
    Returns (success: bool, message: str)
    """
    smtp_host = database.get_setting("smtp_host", "smtp.gmail.com").strip()
    smtp_port = int(database.get_setting("smtp_port", "587"))
    smtp_user = database.get_setting("smtp_user", "").strip()
    smtp_password = database.get_setting("smtp_password", "").strip().replace(" ", "")
    sender_name = database.get_setting("smtp_sender_name", "Hidroponia Rosario").strip()

    if not smtp_user or not smtp_password:
        return False, "Faltan configurar las credenciales de correo SMTP (Email y Contraseña)."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{smtp_user}>"
    msg["To"] = to_email

    # Add HTML body
    part_html = MIMEText(html_content, "html", "utf-8")
    msg.attach(part_html)

    # Attach PDF file if local path exists
    if pdf_url:
        rel_path = pdf_url.lstrip("/")
        if rel_path.startswith("uploads/"):
            local_path = os.path.abspath(rel_path)
            if os.path.exists(local_path):
                try:
                    with open(local_path, "rb") as f:
                        attach = MIMEApplication(f.read(), _subtype="pdf")
                        filename = os.path.basename(local_path)
                        attach.add_header("Content-Disposition", "attachment", filename=filename)
                        msg.attach(attach)
                except Exception as e:
                    print(f"[SMTP Warning] Could not attach PDF: {e}")

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.starttls()

        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [to_email], msg.as_string())
        server.quit()
        return True, "Email enviado con éxito"
    except Exception as e:
        err_msg = str(e)
        print(f"[SMTP Error] {err_msg}")
        return False, f"Error al enviar email: {err_msg}"
