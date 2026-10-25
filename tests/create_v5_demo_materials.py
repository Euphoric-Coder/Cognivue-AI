import os
import fitz # PyMuPDF
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from PIL import Image, ImageDraw, ImageFont

os.makedirs("demo", exist_ok=True)

# 1. Create images for insertion
# Image A: Evaluation Table Card
img_table = Image.new("RGB", (800, 320), color=(255, 255, 255))
d = ImageDraw.Draw(img_table)
d.rectangle([20, 20, 780, 70], fill=(40, 70, 120))
d.text((40, 35), "Model Performance Comparison", fill=(255, 255, 255))

headers = ["Model", "Precision", "Recall", "F1-Score"]
rows = [
    ["Model A", "0.82", "0.80", "0.81"],
    ["Model B", "0.95", "0.93", "0.94"],
    ["Model C", "0.78", "0.85", "0.81"],
]
col_w = 760 // 4
y = 75
d.rectangle([20, y, 780, y + 40], fill=(225, 235, 248), outline=(180, 200, 220))
for i, h in enumerate(headers):
    d.text((30 + i * col_w, y + 10), h, fill=(20, 40, 80))
y += 45

for r_idx, row in enumerate(rows):
    fill = (255, 255, 255) if r_idx % 2 == 0 else (245, 248, 252)
    d.rectangle([20, y, 780, y + 45], fill=fill, outline=(210, 220, 230))
    for i, val in enumerate(row):
        d.text((30 + i * col_w, y + 12), val, fill=(30, 30, 30))
    y += 45
table_img_path = "demo/eval_table.png"
img_table.save(table_img_path)

# Image B: Chart showing accuracy trend across 3 training stages
img_chart = Image.new("RGB", (800, 400), color=(255, 255, 255))
d = ImageDraw.Draw(img_chart)
d.text((40, 20), "Model Training Accuracy Progression", fill=(20, 40, 70))
# Draw axes
d.line([(80, 80), (80, 340), (740, 340)], fill=(80, 80, 80), width=3)
# Draw bars
stages = [("Stage 1", 72, 140), ("Stage 2", 85, 340), ("Stage 3", 93, 540)]
for label, pct, x in stages:
    bar_h = int(pct * 2.4)
    y_top = 340 - bar_h
    d.rectangle([x, y_top, x + 100, 340], fill=(60, 120, 210), outline=(30, 70, 140))
    d.text((x + 25, y_top - 25), f"{pct}%", fill=(20, 50, 100))
    d.text((x + 20, 350), label, fill=(50, 50, 50))
d.text((320, 375), "Training Stages", fill=(80, 80, 80))
chart_img_path = "demo/accuracy_chart.png"
img_chart.save(chart_img_path)

# Image C: Citizen Point Transaction ER Diagram
img_er = Image.new("RGB", (900, 450), color=(250, 252, 255))
d = ImageDraw.Draw(img_er)
d.text((40, 20), "CityCare Citizen Point Transaction Schema (ER Diagram)", fill=(20, 40, 70))
# Entity 1: Citizen
d.rectangle([60, 100, 260, 280], fill=(230, 240, 255), outline=(50, 100, 180), width=2)
d.text((80, 115), "Entity: Citizen", fill=(10, 40, 90))
d.line([(60, 140), (260, 140)], fill=(50, 100, 180), width=1)
d.text((80, 155), "- citizenId (PK)", fill=(30, 30, 30))
d.text((80, 185), "- name", fill=(30, 30, 30))
d.text((80, 215), "- totalPoints", fill=(30, 30, 30))
d.text((80, 245), "- tierStatus", fill=(30, 30, 30))

# Entity 2: PointTransaction
d.rectangle([580, 100, 840, 310], fill=(230, 240, 255), outline=(50, 100, 180), width=2)
d.text((600, 115), "CitizenPointTransaction", fill=(10, 40, 90))
d.line([(580, 140), (840, 140)], fill=(50, 100, 180), width=1)
d.text((600, 155), "- transactionId (PK)", fill=(30, 30, 30))
d.text((600, 185), "- citizenId (FK)", fill=(30, 30, 30))
d.text((600, 215), "- points", fill=(30, 30, 30))
d.text((600, 245), "- actionType", fill=(30, 30, 30))
d.text((600, 275), "- reason", fill=(30, 30, 30))

# Relationship Arrow: Citizen receives PointTransaction
d.line([(260, 190), (580, 190)], fill=(200, 60, 60), width=3)
d.polygon([(570, 182), (585, 190), (570, 198)], fill=(200, 60, 60))
d.text((340, 165), "Citizen receives", fill=(180, 40, 40))
d.text((340, 205), "PointTransaction (1 : N)", fill=(80, 80, 80))
er_img_path = "demo/er_diagram.png"
img_er.save(er_img_path)

# Image D: Badges Schema Diagram
img_badges = Image.new("RGB", (850, 380), color=(250, 252, 255))
d = ImageDraw.Draw(img_badges)
d.text((40, 20), "Badges Specification Diagram", fill=(20, 40, 70))
d.rectangle([80, 80, 400, 320], fill=(235, 245, 235), outline=(40, 120, 50), width=2)
d.text((100, 95), "Badges Entity Schema", fill=(20, 80, 30))
d.line([(80, 125), (400, 125)], fill=(40, 120, 50), width=1)
d.text((100, 140), "- badgeId (PK)", fill=(30, 30, 30))
d.text((100, 175), "- name", fill=(30, 30, 30))
d.text((100, 210), "- is_system_badge: boolean", fill=(30, 30, 30))
d.text((100, 245), "- is_active: boolean", fill=(30, 30, 30))
d.text((100, 280), "- pointThreshold: int", fill=(30, 30, 30))
badges_img_path = "demo/badges_diagram.png"
img_badges.save(badges_img_path)

# Image E: Screenshot of CityCare Admin Dashboard Interface
img_ss = Image.new("RGB", (800, 450), color=(240, 242, 245))
d = ImageDraw.Draw(img_ss)
# UI window header
d.rectangle([0, 0, 800, 40], fill=(30, 35, 45))
d.text((20, 12), "CityCare Civic Governance - Administrative Controls Dashboard", fill=(255, 255, 255))
# Sidebar
d.rectangle([0, 40, 180, 450], fill=(45, 52, 65))
d.text((20, 60), "Overview", fill=(200, 210, 230))
d.text((20, 100), "Issues Moderation", fill=(255, 255, 255))
d.text((20, 140), "Citizen Registry", fill=(200, 210, 230))
d.text((20, 180), "Badges & Points", fill=(200, 210, 230))
d.text((20, 220), "Audit Log", fill=(200, 210, 230))
# Main content area
d.rectangle([200, 60, 460, 160], fill=(255, 255, 255), outline=(200, 205, 215))
d.text((220, 75), "Reported Issues Queue", fill=(40, 40, 50))
d.text((220, 105), "Pending Review: 14", fill=(80, 80, 90))
d.rectangle([480, 60, 760, 160], fill=(255, 255, 255), outline=(200, 205, 215))
d.text((500, 75), "System Health", fill=(40, 40, 50))
d.text((500, 105), "Automated Rules: Active", fill=(40, 140, 60))
d.rectangle([200, 180, 760, 420], fill=(255, 255, 255), outline=(200, 205, 215))
d.text((220, 200), "Issue Moderation Actions", fill=(40, 40, 50))
d.text((220, 235), "Review citizen reports before public dashboard disclosure.", fill=(70, 70, 70))
d.text((220, 265), "Admin controls allow triage, escalation, and point authorization.", fill=(70, 70, 70))
screenshot_img_path = "demo/admin_screenshot.png"
img_ss.save(screenshot_img_path)

# 2. Build PDF: demo/citycare_evaluation_and_metrics.pdf
pdf_doc = fitz.open()

# Page 1: Evaluation Table
p1 = pdf_doc.new_page(width=595, height=842) # A4
p1.insert_text((50, 60), "CityCare AI Module Evaluation", fontsize=18)
p1.insert_text(
    (50, 90),
    "This document details the comparative performance of NLP models for issue classification.\n"
    "The evaluation measures precision, recall, and F1-score across candidate architectures.",
    fontsize=11
)
p1.insert_image(fitz.Rect(50, 140, 545, 360), filename=table_img_path)
p1.insert_text(
    (50, 400),
    "Summary of findings:\n"
    "Model B achieves the highest F1-score of 0.94, outperforming Model A (0.81) and Model C (0.81).\n"
    "Model B is recommended for automated issue triage.",
    fontsize=11
)

# Page 2: Accuracy Chart
p2 = pdf_doc.new_page(width=595, height=842)
p2.insert_text((50, 60), "Training Stage Progression and Accuracy", fontsize=18)
p2.insert_text(
    (50, 90),
    "The graph below depicts the training accuracy progression across three consecutive training stages.",
    fontsize=11
)
p2.insert_image(fitz.Rect(50, 140, 545, 410), filename=chart_img_path)
p2.insert_text(
    (50, 450),
    "The trend demonstrates steady accuracy growth from Stage 1 (72%) up to Stage 3 (93%).\n"
    "Stage 3 exhibits the peak accuracy observed across all experiments.",
    fontsize=11
)

pdf_out = "demo/citycare_evaluation_and_metrics.pdf"
pdf_doc.save(pdf_out)
pdf_doc.close()
print(f"Created {pdf_out}")

# 3. Build PPTX: demo/citycare_architecture_and_gamification.pptx
prs = Presentation()
prs.slide_width = Inches(10)
prs.slide_height = Inches(5.625)
blank_layout = prs.slide_layouts[6]

# Slide 1: ER Diagram
s1 = prs.slides.add_slide(blank_layout)
tx_box = s1.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(8.8), Inches(0.8))
tf = tx_box.text_frame
p = tf.paragraphs[0]
p.text = "CityCare Citizen Point Transaction Architecture"
p.font.size = Pt(22)
p.font.bold = True
s1.shapes.add_picture(er_img_path, Inches(0.6), Inches(1.2), width=Inches(8.8))

# Slide 2: Badges Diagram
s2 = prs.slides.add_slide(blank_layout)
tx_box2 = s2.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(8.8), Inches(0.8))
tf2 = tx_box2.text_frame
p2 = tf2.paragraphs[0]
p2.text = "Badges Gamification Schema"
p2.font.size = Pt(22)
p2.font.bold = True
s2.shapes.add_picture(badges_img_path, Inches(0.6), Inches(1.2), width=Inches(8.8))

# Slide 3: Screenshot of Admin Interface
s3 = prs.slides.add_slide(blank_layout)
tx_box3 = s3.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(8.8), Inches(0.8))
tf3 = tx_box3.text_frame
p3 = tf3.paragraphs[0]
p3.text = "CityCare Platform Administrative Controls"
p3.font.size = Pt(22)
p3.font.bold = True
s3.shapes.add_picture(screenshot_img_path, Inches(0.6), Inches(1.2), width=Inches(8.8))

pptx_out = "demo/citycare_architecture_and_gamification.pptx"
prs.save(pptx_out)
print(f"Created {pptx_out}")
print("Demo materials generated successfully!")
