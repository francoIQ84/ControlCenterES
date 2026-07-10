import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch

from src import database

PDF_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'invoices')

def generate_invoice_pdf(order):
    """
    Generates a beautiful commercial invoice PDF for a given order dictionary.
    Saves the PDF inside the 'invoices' directory and returns the file path.
    """
    os.makedirs(PDF_DIR, exist_ok=True)
    filename = f"factura_{order['order_id']}.pdf"
    filepath = os.path.join(PDF_DIR, filename)

    # Setup document
    doc = SimpleDocTemplate(
        filepath,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    story = []
    styles = getSampleStyleSheet()

    # Define custom styles
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=15
    )

    heading_style = ParagraphStyle(
        'InvoiceHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        textColor=colors.HexColor('#475569'),
        spaceBefore=10,
        spaceAfter=5
    )

    body_style = ParagraphStyle(
        'InvoiceBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#334155'),
        leading=14
    )

    bold_body_style = ParagraphStyle(
        'InvoiceBoldBody',
        parent=body_style,
        fontName='Helvetica-Bold'
    )

    right_bold_style = ParagraphStyle(
        'InvoiceRightBold',
        parent=bold_body_style,
        alignment=2 # Right aligned
    )

    right_body_style = ParagraphStyle(
        'InvoiceRightBody',
        parent=body_style,
        alignment=2 # Right aligned
    )

    # Header section (Seller & Invoice Info)
    # Fetch merchant settings or use defaults
    merchant_name = database.get_setting('merchant_name', 'ControlCenterES S.A.')
    merchant_cuit = database.get_setting('merchant_cuit', '30-71234567-9')
    merchant_address = database.get_setting('merchant_address', 'Av. Corrientes 1234, CABA')
    merchant_phone = database.get_setting('merchant_phone', '+54 11 4321-8765')
    
    order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00'))
    formatted_date = order_date.strftime("%d/%m/%Y %H:%M")

    header_data = [
        [
            Paragraph(f"<b>{merchant_name}</b><br/>CUIT: {merchant_cuit}<br/>{merchant_address}<br/>Tel: {merchant_phone}", body_style),
            Paragraph(f"<font size=16 color='#2563EB'><b>COMPROBANTE COMERCIAL</b></font><br/><br/><b>Nro. Factura:</b> CC-{order['order_id']}<br/><b>Fecha:</b> {formatted_date}", right_body_style)
        ]
    ]

    header_table = Table(header_data, colWidths=[3.5 * inch, 3.5 * inch])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 20))

    # Divider line
    divider = Table([['']], colWidths=[7.0 * inch])
    divider.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 1, colors.HexColor('#CBD5E1')),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(divider)
    story.append(Spacer(1, 15))

    # Buyer Section
    buyer = order['buyer']
    buyer_doc = f"{buyer.get('document_type', 'DNI')}: {buyer.get('document_number', '-')}" if buyer.get('document_number') else "DNI: -"
    buyer_phone = buyer.get('phone', '-') or '-'
    buyer_email = buyer.get('email', '-') or '-'

    buyer_data = [
        [
            Paragraph("<b>CLIENTE / FACTURADO A:</b>", heading_style),
            Paragraph("<b>DETALLE DE ENVÍO:</b>", heading_style)
        ],
        [
            Paragraph(f"<b>Nombre:</b> {buyer['name']}<br/><b>Usuario ML:</b> {buyer['nickname']}<br/><b>Documento:</b> {buyer_doc}<br/><b>Email:</b> {buyer_email}", body_style),
            Paragraph(f"<b>Estado Envío:</b> {order['shipping_status'].upper()}<br/><b>Estado Pago:</b> {order['payment_status'].upper()}<br/><b>Teléfono:</b> {buyer_phone}", body_style)
        ]
    ]
    buyer_table = Table(buyer_data, colWidths=[3.5 * inch, 3.5 * inch])
    buyer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(buyer_table)
    story.append(Spacer(1, 25))

    # Items table
    # Columns: Item description, Quantity, Unit Price, Total
    table_content = [
        [
            Paragraph("<b>Producto / Descripción</b>", bold_body_style),
            Paragraph("<b>Cant.</b>", right_bold_style),
            Paragraph("<b>Precio Unit.</b>", right_bold_style),
            Paragraph("<b>Total</b>", right_bold_style)
        ]
    ]

    for item in order['items']:
        subtotal_item = item['price'] * item['quantity']
        table_content.append([
            Paragraph(item['title'], body_style),
            Paragraph(str(item['quantity']), right_body_style),
            Paragraph(f"${item['price']:,.2f}", right_body_style),
            Paragraph(f"${subtotal_item:,.2f}", right_body_style)
        ])

    # Totals rows
    table_content.append([
        '', '',
        Paragraph("<b>Total General:</b>", right_bold_style),
        Paragraph(f"<b>${order['total_amount']:,.2f}</b>", right_bold_style)
    ])

    items_table = Table(table_content, colWidths=[3.8 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch])
    items_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F1F5F9')),
        ('PADDING', (0,0), (-1,-1), 8),
        ('LINEBELOW', (0,0), (-1,0), 1, colors.HexColor('#CBD5E1')),
        ('LINEBELOW', (0,1), (-1,-2), 0.5, colors.HexColor('#E2E8F0')),
        ('LINEABOVE', (2,-1), (3,-1), 1, colors.HexColor('#94A3B8')),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 40))

    # Terms / Footer
    footer_text = Paragraph(
        "<font size=8 color='#94A3B8'>Este documento es una representación impresa de una transacción comercial realizada a través de Mercado Libre. "
        "No es válido como factura fiscal oficial en los términos de entes recaudadores nacionales salvo que se complemente con el comprobante fiscal legal correspondiente.</font>",
        body_style
    )
    story.append(footer_text)

    # Build document
    doc.build(story)
    
    # Update local DB cache
    database.update_order_invoice_status(order['order_id'], 1)
    
    return filepath
