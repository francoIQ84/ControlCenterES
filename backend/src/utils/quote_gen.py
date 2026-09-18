import os
import json
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

from src import database

QUOTES_PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'quotes')


def format_currency(val) -> str:
    try:
        n = float(val or 0.0)
        return f"${n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return f"${val}"


def format_date(dt_val) -> str:
    if not dt_val:
        return ""
    try:
        if isinstance(dt_val, str):
            # Try parsing ISO
            clean_str = dt_val.split('.')[0].replace('Z', '')
            if 'T' in clean_str:
                d = datetime.fromisoformat(clean_str)
            else:
                d = datetime.strptime(clean_str, '%Y-%m-%d %H:%M:%S')
        elif hasattr(dt_val, 'strftime'):
            d = dt_val
        else:
            return str(dt_val)
        return d.strftime('%d/%m/%Y')
    except Exception:
        return str(dt_val)[:10]


def generate_quote_pdf(quote: dict) -> str:
    """Genera un archivo PDF profesional para un presupuesto y retorna la ruta del archivo."""
    os.makedirs(QUOTES_PDF_DIR, exist_ok=True)
    filename = f"presupuesto_{quote.get('quote_number', quote.get('id', 'doc'))}.pdf"
    filepath = os.path.join(QUOTES_PDF_DIR, filename)

    # Document setup: A4 with 14mm margins
    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm
    )

    usable_w = A4[0] - 28 * mm
    styles = getSampleStyleSheet()

    # Custom typography styles
    style_normal = ParagraphStyle('QNormal', fontName='Helvetica', fontSize=8.5, leading=11, textColor=colors.HexColor('#1e293b'))
    style_muted = ParagraphStyle('QMuted', fontName='Helvetica', fontSize=7.5, leading=10, textColor=colors.HexColor('#64748b'))
    style_bold = ParagraphStyle('QBold', fontName='Helvetica-Bold', fontSize=8.5, leading=11, textColor=colors.HexColor('#0f172a'))
    style_title = ParagraphStyle('QTitle', fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=colors.HexColor('#0f172a'))
    style_subtitle = ParagraphStyle('QSubtitle', fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=colors.HexColor('#2563eb'))
    style_table_header = ParagraphStyle('QTH', fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.white, alignment=TA_CENTER)
    style_cell_left = ParagraphStyle('QTCL', fontName='Helvetica', fontSize=8, leading=10.5, textColor=colors.HexColor('#1e293b'), alignment=TA_LEFT)
    style_cell_center = ParagraphStyle('QTCC', fontName='Helvetica', fontSize=8, leading=10.5, textColor=colors.HexColor('#1e293b'), alignment=TA_CENTER)
    style_cell_right = ParagraphStyle('QTCR', fontName='Helvetica', fontSize=8, leading=10.5, textColor=colors.HexColor('#1e293b'), alignment=TA_RIGHT)
    style_notes = ParagraphStyle('QNotes', fontName='Helvetica', fontSize=8, leading=11, textColor=colors.HexColor('#334155'))

    # Load merchant info from settings (commercial name and address prioritized)
    commercial_name = (database.get_setting('merchant_commercial_name') or '').strip()
    if not commercial_name:
        try:
            import json
            web_cfg = json.loads(database.get_setting('web_config', '{}') or '{}')
            if web_cfg.get('store_name'):
                commercial_name = web_cfg['store_name'].strip()
        except Exception:
            pass
    if not commercial_name:
        commercial_name = 'Experiencia Sustentable'

    commercial_address = (database.get_setting('merchant_commercial_address') or '').strip()
    if not commercial_address:
        try:
            import json
            web_cfg = json.loads(database.get_setting('web_config', '{}') or '{}')
            if web_cfg.get('address'):
                commercial_address = web_cfg['address'].strip()
        except Exception:
            pass
    if not commercial_address:
        commercial_address = 'Zeballos 1726, Rosario, Santa Fe, Argentina'

    show_legal_name = database.get_setting('quote_show_legal_name', 'false').lower() in ('true', '1', 'yes')
    legal_name = (database.get_setting('quote_legal_name') or database.get_setting('merchant_name') or '').strip()

    show_cuit = database.get_setting('quote_show_cuit', 'false').lower() in ('true', '1', 'yes')
    merchant_cuit = (database.get_setting('quote_cuit') or database.get_setting('afip_cuit') or '').strip()

    merchant_phone = (database.get_setting('merchant_phone') or '').strip()
    merchant_email = (database.get_setting('merchant_email') or '').strip()
    merchant_bank_cbu = database.get_setting('merchant_bank_cbu', '')
    merchant_bank_alias = database.get_setting('merchant_bank_alias', '')
    merchant_bank_name = database.get_setting('merchant_bank_name', '')
    merchant_bank_holder = database.get_setting('merchant_bank_holder', '')
    logo_path = database.get_setting('logo_url', '')

    story = []

    # -------------------------------------------------------------------------
    # 1. Header: Merchant Info (Left) & Document Details (Right)
    # -------------------------------------------------------------------------
    merchant_lines = [
        f"<b><font size='13' color='#0f172a'>{commercial_name.upper()}</font></b>"
    ]
    if show_legal_name and legal_name:
        merchant_lines.append(f"<font color='#64748b'>Razón Social:</font> {legal_name}")
    if show_cuit and merchant_cuit:
        merchant_lines.append(f"<font color='#64748b'>CUIT:</font> {merchant_cuit}")
    if commercial_address:
        merchant_lines.append(f"<font color='#64748b'>Dirección:</font> {commercial_address}")
    if merchant_phone:
        merchant_lines.append(f"<font color='#64748b'>Tel / WhatsApp:</font> {merchant_phone}")
    if merchant_email:
        merchant_lines.append(f"<font color='#64748b'>Email:</font> {merchant_email}")

    merchant_html = "<br/>".join(merchant_lines)
    p_merchant = Paragraph(merchant_html, style_normal)

    # Document Box Details
    quote_num = quote.get('quote_number', f"PRES-{quote.get('id', '0001')}")
    created_date_str = format_date(quote.get('created_at'))
    valid_until_str = format_date(quote.get('valid_until'))
    valid_days_num = quote.get('valid_days', 7)
    creator = quote.get('created_by_user', 'Asesor Comercial')

    doc_info_lines = [
        f"<font size='14' color='#2563eb'><b>PRESUPUESTO</b></font>",
        f"<b>N°:</b> <font color='#0f172a' size='10'><b>{quote_num}</b></font>",
        f"<b>Fecha de Emisión:</b> {created_date_str}",
        f"<b>Válido hasta:</b> {valid_until_str} ({valid_days_num} días)",
        f"<b>Atendido por:</b> {creator}"
    ]
    doc_info_html = "<br/>".join(doc_info_lines)
    p_doc_info = Paragraph(doc_info_html, style_normal)

    header_table = Table([[p_merchant, p_doc_info]], colWidths=[usable_w * 0.58, usable_w * 0.42])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 4),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#f8fafc')),
        ('BOX', (1, 0), (1, 0), 1, colors.HexColor('#cbd5e1')),
        ('ROUNDEDCORNERS', [4, 4, 4, 4])
    ]))
    story.append(header_table)
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # 2. Customer Information Card
    # -------------------------------------------------------------------------
    cust_name = quote.get('customer_name', 'Consumidor Final')
    cust_doc = quote.get('customer_doc', '')
    cust_phone = quote.get('customer_phone', '')
    cust_email = quote.get('customer_email', '')
    cust_address = quote.get('customer_address', '')

    cust_left = [
        f"<b>CLIENTE / RAZÓN SOCIAL:</b> {cust_name}"
    ]
    if cust_doc:
        cust_left.append(f"<b>DNI / CUIT:</b> {cust_doc}")
    if cust_address:
        cust_left.append(f"<b>Domicilio:</b> {cust_address}")

    cust_right = []
    if cust_phone:
        cust_right.append(f"<b>Teléfono / WhatsApp:</b> {cust_phone}")
    if cust_email:
        cust_right.append(f"<b>Correo Electrónico:</b> {cust_email}")
    if not cust_right:
        cust_right.append("<b>Condición:</b> Consumidor Final")

    p_cust_left = Paragraph("<br/>".join(cust_left), style_normal)
    p_cust_right = Paragraph("<br/>".join(cust_right), style_normal)

    cust_table = Table([[p_cust_left, p_cust_right]], colWidths=[usable_w * 0.55, usable_w * 0.45])
    cust_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(cust_table)
    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 3. Products / Items Table
    # -------------------------------------------------------------------------
    items = quote.get('items', [])
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []

    table_data = [[
        Paragraph("<b>#</b>", style_table_header),
        Paragraph("<b>CÓDIGO / SKU</b>", style_table_header),
        Paragraph("<b>DESCRIPCIÓN DEL PRODUCTO</b>", style_table_header),
        Paragraph("<b>CANT.</b>", style_table_header),
        Paragraph("<b>PRECIO UNIT.</b>", style_table_header),
        Paragraph("<b>SUBTOTAL</b>", style_table_header)
    ]]

    subtotal_sum = 0.0
    for idx, it in enumerate(items, start=1):
        qty = int(it.get('quantity') or 1)
        price = float(it.get('price') or 0.0)
        item_sub = qty * price
        subtotal_sum += item_sub

        sku = str(it.get('sku') or it.get('id') or '-')
        if sku.startswith('manual-'):
            sku = '-'
        title = str(it.get('title') or 'Artículo sin título')

        table_data.append([
            Paragraph(str(idx), style_cell_center),
            Paragraph(sku, style_cell_center),
            Paragraph(title, style_cell_left),
            Paragraph(str(qty), style_cell_center),
            Paragraph(format_currency(price), style_cell_right),
            Paragraph(format_currency(item_sub), style_cell_right)
        ])

    col_widths = [
        usable_w * 0.05,
        usable_w * 0.16,
        usable_w * 0.45,
        usable_w * 0.08,
        usable_w * 0.13,
        usable_w * 0.13
    ]

    t_style = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]

    # Alternate row colors
    for r in range(1, len(table_data)):
        bg_col = colors.HexColor('#ffffff') if r % 2 != 0 else colors.HexColor('#f8fafc')
        t_style.append(('BACKGROUND', (0, r), (-1, r), bg_col))

    prod_table = Table(table_data, colWidths=col_widths)
    prod_table.setStyle(TableStyle(t_style))
    story.append(prod_table)
    story.append(Spacer(1, 10))

    # -------------------------------------------------------------------------
    # 4. Total Amount Block
    # -------------------------------------------------------------------------
    total_amount = float(quote.get('total_amount') or subtotal_sum)
    totals_data = [
        [
            Paragraph("<b>TOTAL PRESUPUESTADO (ARS):</b>", ParagraphStyle('QTLabel', fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#0f172a'), alignment=TA_RIGHT)),
            Paragraph(f"<b><font size='12' color='#16a34a'>{format_currency(total_amount)}</font></b>", ParagraphStyle('QVal', fontName='Helvetica-Bold', alignment=TA_RIGHT))
        ]
    ]
    totals_table = Table(totals_data, colWidths=[usable_w * 0.70, usable_w * 0.30])
    totals_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('PADDING', (0, 0), (-1, -1), 6)
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 5. Terms, Validity & Bank Information Box
    # -------------------------------------------------------------------------
    conditions = []
    conditions.append(f"• <b>Validez de Precios:</b> Los valores expresados en este presupuesto son válidos por <b>{valid_days_num} días corridos</b> a partir de la fecha de emisión ({created_date_str}). Vencido dicho plazo, los precios y stock quedan sujetos a reconfirmación.")
    conditions.append("• <b>Reserva de Stock:</b> El presente presupuesto constituye una cotización y no representa reserva de mercadería hasta la confirmación efectiva del pago.")

    # Bank data if exists
    if merchant_bank_cbu or merchant_bank_alias:
        bank_txt = "• <b>Datos para Transferencia / Depósito:</b> "
        b_parts = []
        if merchant_bank_name:
            b_parts.append(f"Banco: <b>{merchant_bank_name}</b>")
        if merchant_bank_alias:
            b_parts.append(f"Alias: <b>{merchant_bank_alias}</b>")
        if merchant_bank_cbu:
            b_parts.append(f"CBU: <b>{merchant_bank_cbu}</b>")
        if merchant_bank_holder:
            b_parts.append(f"Titular: <b>{merchant_bank_holder}</b>")
        bank_txt += " | ".join(b_parts)
        conditions.append(bank_txt)

    # Custom Quote Notes if provided by operator
    quote_notes = quote.get('notes', '')
    if quote_notes and quote_notes.strip():
        conditions.append(f"• <b>Observaciones:</b> {quote_notes.strip()}")

    terms_html = "<br/><br/>".join(conditions)
    p_terms = Paragraph(f"<b>CONDICIONES COMERCIALES:</b><br/><br/>{terms_html}", style_notes)

    terms_table = Table([[p_terms]], colWidths=[usable_w])
    terms_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fafafa')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 8)
    ]))
    story.append(terms_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 6. Corporate Footer
    # -------------------------------------------------------------------------
    emitter_name = commercial_name
    if show_legal_name and legal_name and legal_name.lower() != commercial_name.lower():
        emitter_name += f" ({legal_name})"
    footer_text = f"Documento de cotización emitido por <b>{emitter_name}</b> · No válido como factura fiscal conforme a las normativas de AFIP/ARCA."
    story.append(Paragraph(footer_text, ParagraphStyle('QFoot', fontName='Helvetica', fontSize=7.5, leading=10, textColor=colors.HexColor('#94a3b8'), alignment=TA_CENTER)))

    # Build PDF
    doc.build(story)
    return filepath
