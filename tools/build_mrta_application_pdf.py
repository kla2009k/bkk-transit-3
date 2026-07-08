from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "mrta_camp" / "Bangkok_Transit_3D_MRTA_Application.pdf"

# แก้ 3 ค่านี้ก่อนส่งจริง ถ้าชื่อทีม/โรงเรียน/URL เปลี่ยน
PROJECT_NAME = "Bangkok Transit 3D"
TEAM_NAME = "ทีม Bangkok Transit 3D"
SCHOOL_NAME = "ผลงานประกอบการสมัครโดยผู้สมัครระดับนักเรียน/นักศึกษา"
DEMO_URL = "https://kla2009k.github.io/bkk-transit-3/"

FONT = "Tahoma"
FONT_BOLD = "Tahoma-Bold"
TAHOMA = Path(r"C:\Windows\Fonts\tahoma.ttf")
TAHOMABD = Path(r"C:\Windows\Fonts\tahomabd.ttf")

pdfmetrics.registerFont(TTFont(FONT, str(TAHOMA)))
pdfmetrics.registerFont(TTFont(FONT_BOLD, str(TAHOMABD)))

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="Thai",
        parent=styles["Normal"],
        fontName=FONT,
        fontSize=10.2,
        leading=16,
        textColor=colors.HexColor("#1f2933"),
        alignment=TA_LEFT,
        wordWrap="CJK",
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="ThaiSmall",
        parent=styles["Thai"],
        fontSize=8.8,
        leading=13,
        textColor=colors.HexColor("#59636f"),
    )
)
styles.add(
    ParagraphStyle(
        name="H1Thai",
        parent=styles["Thai"],
        fontName=FONT_BOLD,
        fontSize=24,
        leading=31,
        textColor=colors.HexColor("#123047"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="H2Thai",
        parent=styles["Thai"],
        fontName=FONT_BOLD,
        fontSize=15,
        leading=21,
        textColor=colors.HexColor("#123047"),
        spaceBefore=4,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="Tag",
        parent=styles["Thai"],
        fontName=FONT_BOLD,
        fontSize=9,
        leading=12,
        textColor=colors.white,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverMeta",
        parent=styles["Thai"],
        fontSize=11,
        leading=17,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#34495e"),
    )
)


def p(text, style="Thai"):
    return Paragraph(text, styles[style])


def bullet(items):
    return ListFlowable(
        [
            ListItem(p(item), leftIndent=0, bulletColor=colors.HexColor("#0f6b8f"))
            for item in items
        ],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName=FONT,
        bulletFontSize=8,
    )


def section(title, body=None, bullets=None):
    flow = [p(title, "H2Thai")]
    if body:
        flow.append(p(body))
    if bullets:
        flow.append(bullet(bullets))
    flow.append(Spacer(1, 5 * mm))
    return KeepTogether(flow)


def tag(text, bg="#0f6b8f"):
    t = Table([[p(text, "Tag")]], colWidths=[43 * mm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(bg)),
                ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor(bg)),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def img(path, width_mm):
    im = Image(str(ROOT / path))
    ratio = im.imageHeight / float(im.imageWidth)
    im.drawWidth = width_mm * mm
    im.drawHeight = im.drawWidth * ratio
    return im


def feature_table(rows):
    data = [[p("<b>ฟีเจอร์</b>"), p("<b>ประโยชน์ต่อผู้ใช้/กรรมการ</b>")]]
    data.extend([[p(a), p(b)] for a, b in rows])
    table = Table(data, colWidths=[56 * mm, 101 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f3f7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#123047")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d5dde3")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.HexColor("#6b7280"))
    canvas.drawString(18 * mm, 10 * mm, "Bangkok Transit 3D - MRTA Innovation Camp 2026")
    canvas.drawRightString(192 * mm, 10 * mm, f"หน้า {doc.page}")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=17 * mm,
        bottomMargin=18 * mm,
        title="Bangkok Transit 3D MRTA Innovation Camp 2026",
        author=TEAM_NAME,
    )

    story = []

    # 1. Cover
    story.extend(
        [
            Spacer(1, 16 * mm),
            tag("MRTA Innovation Camp 2026", "#123047"),
            Spacer(1, 8 * mm),
            p(PROJECT_NAME, "H1Thai"),
            p("ผู้ช่วยวางแผนและซ้อมเดินทางระบบรางกรุงเทพฯ สำหรับผู้โดยสารใหม่", "CoverMeta"),
            Spacer(1, 6 * mm),
            p(TEAM_NAME, "CoverMeta"),
            p(SCHOOL_NAME, "CoverMeta"),
            Spacer(1, 7 * mm),
            p(
                "แนวคิดหลัก: จากมุมมองเด็กต่างจังหวัดที่เข้ากรุงเทพฯ แล้วรู้สึกว่าระบบรางทันสมัยมาก แต่ยังน่ากลัวสำหรับผู้ใช้ครั้งแรก เราจึงสร้างเว็บแอปที่ช่วยให้ผู้โดยสารซ้อมการเดินทาง เห็นเส้นทาง ค่าโดยสาร การเปลี่ยนสาย เวลาเดินรถ และข้อมูลสถานีก่อนออกจากบ้าน",
            ),
            Spacer(1, 7 * mm),
            p(f"<b>Demo URL:</b> {DEMO_URL}"),
            p("หาก URL ยังไม่เปิด ให้ใช้ไฟล์ PDF นี้ร่วมกับ GitHub Pages หลัง deploy", "ThaiSmall"),
            Spacer(1, 8 * mm),
            img("mrta_camp/features-1-5-final-desktop.png", 154),
            Spacer(1, 6 * mm),
            p("ภาพจาก prototype จริงของ Bangkok Transit 3D", "ThaiSmall"),
            PageBreak(),
        ]
    )

    # 2. Problem
    story.extend(
        [
            section(
                "2. ปัญหาที่เจอ",
                "สำหรับคนที่ใช้ชีวิตอยู่ต่างจังหวัด การเดินทางด้วยรถไฟฟ้าในกรุงเทพฯ ไม่ได้ยากเพราะไม่มีแผนที่ แต่ยากเพราะไม่มั่นใจว่าจะทำถูกไหมตั้งแต่ก่อนเริ่มเดินทาง ระบบรางมีหลายสี หลายผู้ให้บริการ หลายบัตร หลายจุดเปลี่ยนสาย และสถานีขนาดใหญ่ที่มีทางออกจำนวนมาก",
                [
                    "ไม่รู้ว่าควรขึ้นสายไหน เปลี่ยนสายที่สถานีใด และต้องเดินต่อไกลแค่ไหน",
                    "ไม่แน่ใจว่าค่าโดยสารจริงเท่าไหร่ และสิทธิ 20 บาทตลอดสายใช้กับทริปของตัวเองอย่างไร",
                    "กลัวแตะบัตรผิดระบบ กลัวเปลี่ยนสายผิดฝั่ง หรือกลัวลงสถานีถูกแต่ใช้ทางออกผิด",
                    "ข้อมูลกระจายอยู่หลายเว็บหลายแอป ทำให้ผู้โดยสารใหม่ต้องเดาเองในช่วงที่ควรจะมั่นใจที่สุด",
                    "ความไม่มั่นใจนี้ทำให้บางคนเลือกแท็กซี่หรือรถส่วนตัว แม้ระบบรางจะเป็นทางเลือกที่ดีต่อเมืองมากกว่า",
                ],
            ),
            p(
                "<b>โจทย์ที่เราเห็น:</b> ถ้า MRT และระบบรางกรุงเทพฯ ต้องการเข้าถึงผู้โดยสารใหม่ โดยเฉพาะคนต่างจังหวัด ระบบต้องไม่ได้แค่บอกว่า 'ไปทางไหน' แต่ต้องช่วยให้เขารู้สึกว่า 'ฉันเดินทางเองได้'",
            ),
            PageBreak(),
        ]
    )

    # 3. Concept
    story.extend(
        [
            section(
                "3. แนวคิดผลงาน",
                "Bangkok Transit 3D คือเว็บแอปแผนที่รถไฟฟ้า 3 มิติที่ทำหน้าที่เป็น pre-trip simulator สำหรับผู้โดยสารใหม่ ผู้ใช้สามารถเปิดดูเส้นทางก่อนออกจากบ้าน เห็นภาพรวมของระบบราง วางแผนการเปลี่ยนสาย เปรียบเทียบค่าโดยสาร ดูเวลาและความถี่รถ รวมถึงซ้อมขั้นตอนการเดินทางครั้งแรกแบบเป็นลำดับ",
                [
                    "ไม่ใช่แค่แผนที่นิ่ง แต่เป็นเครื่องมือช่วยตัดสินใจและลดความกลัวก่อนเดินทาง",
                    "ออกแบบให้กรรมการหรือผู้ใช้ใหม่กด Demo Mode แล้วเห็นคุณค่าของผลงานได้ภายในไม่กี่นาที",
                    "แยกข้อมูลจริง ข้อมูลเปิด และข้อมูลประมาณการอย่างชัดเจน เพื่อไม่สร้างความเข้าใจผิด",
                    "ทำเป็นเว็บแอป/PWA ใช้ได้บนมือถือ ไม่ต้องติดตั้งแอปใหญ่ และต่อยอดกับระบบข้อมูลทางการได้",
                ],
            ),
            section(
                "นิยามสั้นของผลงาน",
                "Bangkok Transit 3D คือผู้ช่วยซ้อมเดินทางระบบราง ที่ทำให้ผู้โดยสารใหม่เข้าใจเส้นทาง ค่าโดยสาร เวลาเดินรถ และการเปลี่ยนสายก่อนออกจากบ้าน โดยเฉพาะคนต่างจังหวัดที่ยังไม่คุ้นเคยกับ MRT และระบบรางกรุงเทพฯ",
            ),
            PageBreak(),
        ]
    )

    # 4. Target users
    story.extend(
        [
            section(
                "4. กลุ่มเป้าหมาย/ผู้ใช้",
                "กลุ่มเป้าหมายหลักคือผู้ที่มีเหตุผลต้องเข้ามาใช้ระบบรางในกรุงเทพฯ แต่ยังไม่คุ้นกับรูปแบบการเดินทางจริง",
                [
                    "คนต่างจังหวัดที่เข้ากรุงเทพฯ เพื่อเรียน ทำงาน สอบ แข่งขัน รักษาพยาบาล หรือทำธุระราชการ",
                    "นักเรียนและนักศึกษาที่เริ่มเดินทางเอง และต้องการเครื่องมือซ้อมก่อนเดินทางจริง",
                    "นักท่องเที่ยวไทย/ต่างชาติที่ต้องการเข้าใจระบบรถไฟฟ้าหลายสีอย่างรวดเร็ว",
                    "ผู้โดยสารใหม่ของ MRT, BTS, ARL, SRT Red Line และสายโมโนเรลที่ต้องเปลี่ยนระบบ",
                    "ผู้สูงอายุหรือคนที่ไม่มั่นใจกับการเดินทางในสถานีขนาดใหญ่",
                    "ผู้ที่ต้องเดินทางไปโรงพยาบาล สถานศึกษา หน่วยงานรัฐ ศูนย์ประชุม หรือจุดสำคัญในเมือง",
                ],
            ),
            section(
                "มุมมองที่ทำให้ผลงานนี้ต่าง",
                "ทีมไม่ได้เริ่มจากคำถามว่า 'ทำแผนที่ให้สวยอย่างไร' แต่เริ่มจากคำถามว่า 'ทำอย่างไรให้คนที่ไม่คุ้นกับกรุงเทพฯ กล้าขึ้นรถไฟฟ้าด้วยตัวเองครั้งแรก' ซึ่งเป็น pain point ที่ทีมสัมผัสได้จริงจากการเป็นคนต่างจังหวัด",
            ),
            PageBreak(),
        ]
    )

    # 5. Features
    story.extend(
        [
            p("5. ฟีเจอร์หลัก", "H2Thai"),
            p("ฟีเจอร์ถูกออกแบบให้ตอบโจทย์ทั้งผู้โดยสารใหม่และการคัดเลือกของกรรมการ โดยเน้นให้เห็น prototype จริง ไม่ใช่เฉพาะไอเดียบนกระดาษ"),
            feature_table(
                [
                    ("แผนที่รถไฟฟ้า 3D", "แสดงโครงข่ายระบบรางหลายสายแบบเห็นภาพรวม ช่วยให้ผู้ใช้เข้าใจเมืองและเส้นทางเร็วขึ้น"),
                    ("วางแผนเส้นทาง", "ค้นหาต้นทาง-ปลายทาง แสดงสถานีที่ต้องผ่านและจุดเปลี่ยนสาย"),
                    ("เทียบค่าโดยสาร 20 บาท vs ปกติ", "ช่วยให้ผู้ใช้เข้าใจผลของนโยบาย 20 บาทต่อทริปจริง ไม่ใช่แค่อ่านข่าว"),
                    ("ตารางเวลา/ความถี่รถ", "รวมข้อมูลเวลาเดินรถและ headway เพื่อช่วยวางแผนก่อนออกจากบ้าน"),
                    ("โหมดซ้อมนั่งครั้งแรก", "อธิบายขั้นตอนเดินทางเป็นลำดับ ลดความกลัวของผู้ใช้ใหม่"),
                    ("MRTA Mode", "เน้นสายที่เกี่ยวข้องกับ รฟม. เช่น น้ำเงิน ม่วง เหลือง ชมพู เพื่อดูบทบาทของ MRTA ในโครงข่าย"),
                    ("Demo Mode สำหรับกรรมการ", "กดปุ่มเดียวแล้วเห็น flow สำคัญ เหมาะกับการคัดเลือกรอบเอกสารหรือเดโมสั้น"),
                    ("บริการ/ข่าวสาร/เพิ่มเติม", "โครงสร้างเหมือนแอปขนส่งจริง แต่ใช้ข้อมูลที่ควบคุมความถูกต้องและไม่สร้างข่าวปลอม"),
                    ("Accessibility / ทางออก / แหล่งข้อมูล", "เปิดทางต่อยอดสู่ข้อมูลลิฟต์ บันไดเลื่อน ทางออก และ transparency ของข้อมูล"),
                ]
            ),
            PageBreak(),
        ]
    )

    # 6. MRTA relevance
    story.extend(
        [
            section(
                "6. ความเกี่ยวข้องกับโจทย์ MRTA",
                "โจทย์ของ MRTA Innovation Camp 2026 ให้สร้างนวัตกรรมหรือแนวคิดใหม่ที่ยกระดับประสบการณ์การเดินทาง MRT และสร้างประโยชน์ต่อผู้คน สังคม และสิ่งแวดล้อม Bangkok Transit 3D ตอบโจทย์นี้โดยตรง เพราะแก้ปัญหาประสบการณ์ก่อนเดินทาง ซึ่งเป็นจุดที่ผู้โดยสารใหม่มักหลุดออกจากระบบขนส่งสาธารณะ",
                [
                    "<b>Customer-Problem Understanding:</b> ปัญหาเกิดจากผู้ใช้จริงที่ไม่คุ้นระบบราง โดยเฉพาะคนต่างจังหวัด",
                    "<b>Sustainable Solutions:</b> เป็นเว็บแอปต้นทุนต่ำ ใช้ข้อมูลเปิด และต่อยอดเป็น API/data partnership ได้",
                    "<b>Social & Environment Impact:</b> ถ้าคนกล้าใช้รถไฟฟ้ามากขึ้น จะลดการพึ่งรถส่วนตัวและช่วยลดการปล่อยคาร์บอน",
                    "<b>Idea Development Plan:</b> มี prototype ใช้งานได้จริง มีฟีเจอร์เดโม มีแผนต่อยอดกับ incident, accessibility และ service data",
                ],
            ),
            section(
                "ทำไม รฟม. ควรสนใจ",
                "เพราะระบบรางที่ดีไม่ได้จบที่การสร้างเส้นทาง แต่ต้องทำให้คนใหม่เข้าใจและกล้าใช้เส้นทางนั้น Bangkok Transit 3D เป็นชั้นประสบการณ์ผู้ใช้ที่ช่วยแปลระบบรางทั้งเมืองให้กลายเป็นการเดินทางที่ผู้โดยสารรู้สึกควบคุมได้",
            ),
            PageBreak(),
        ]
    )

    # 7. Screenshots
    story.extend(
        [
            p("7. ภาพหน้าจอผลงานจาก prototype จริง", "H2Thai"),
            p("ภาพด้านล่างเป็น screenshot จากเว็บแอปจริง ไม่ใช่ mockup แยกจากตัวผลงาน"),
            Table(
                [
                    [
                        img("mrta_camp/features-1-5-final-mobile.png", 47),
                        img("mrta_camp/features-1-14-mobile.png", 47),
                        img("mrta_camp/tabs-expanded-mobile.png", 47),
                    ],
                    [
                        p("มือถือ: หน้า app/tab และบริการ", "ThaiSmall"),
                        p("มือถือ: ฟีเจอร์ 1-14", "ThaiSmall"),
                        p("มือถือ: บริการ/ข่าวสาร/เพิ่มเติม", "ThaiSmall"),
                    ],
                ],
                colWidths=[52 * mm, 52 * mm, 52 * mm],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ]
                ),
            ),
            Spacer(1, 5 * mm),
            img("mrta_camp/tabs-expanded-desktop.png", 154),
            p("Desktop: หน้า tab และข้อมูลบริการแบบเต็มจอ", "ThaiSmall"),
            PageBreak(),
        ]
    )

    # 8. Roadmap
    story.extend(
        [
            section(
                "8. แผนพัฒนาต่อ",
                "Prototype ปัจจุบันถูกออกแบบให้ต่อยอดกับข้อมูลทางการได้ โดยไม่จำเป็นต้องรื้อระบบใหม่",
                [
                    "เชื่อม incident feed จริงจากผู้ให้บริการหรือหน่วยงานกลาง เพื่อแจ้งเหตุขัดข้องโดยไม่ต้องทำข่าวปลอม",
                    "เชื่อมข้อมูลลิฟต์ บันไดเลื่อน ห้องน้ำ จุดบริการ และสถานะอุปกรณ์แบบ real-time",
                    "เพิ่ม crowd level หรือระดับความหนาแน่น เพื่อช่วยผู้สูงอายุและผู้โดยสารที่ต้องการหลีกเลี่ยงความแออัด",
                    "ทำ route สำหรับ wheelchair และผู้มีข้อจำกัดด้านการเดินทาง โดยให้ระบบเลือกสถานี/ทางออกที่เหมาะสม",
                    "เชื่อมข้อมูล MRTA/BEM/BTS/SRTET ในรูปแบบ service API เพื่อทำให้ตารางเวลา ค่าโดยสาร และประกาศเป็นปัจจุบัน",
                    "ทดสอบ UX กับผู้ใช้จริงจากต่างจังหวัด แล้วปรับ flow ภาษา ปุ่ม และคำอธิบายให้เข้าใจง่ายขึ้น",
                ],
            ),
            section(
                "ลำดับการพัฒนาหลังเข้าค่าย",
                "ระยะสั้น: เก็บ feedback และปรับ UX<br/>ระยะกลาง: เชื่อมข้อมูลทางการและทำ accessibility route<br/>ระยะยาว: พัฒนาเป็นเครื่องมือ pre-trip assistant ที่หน่วยงานหรือผู้ให้บริการสามารถใช้ร่วมกับช่องทางทางการได้",
            ),
            PageBreak(),
        ]
    )

    # 9. Impact
    story.extend(
        [
            section(
                "9. ผลกระทบที่คาดว่าจะได้รับ",
                "ผลลัพธ์ของผลงานไม่ได้วัดแค่จำนวนฟีเจอร์ แต่วัดจากความมั่นใจของผู้โดยสารใหม่และโอกาสที่เขาจะเลือกใช้ระบบรางแทนรถส่วนตัว",
                [
                    "ลดความกลัวและความสับสนของผู้ใช้ระบบรางครั้งแรก",
                    "เพิ่มโอกาสให้คนต่างจังหวัด นักเรียน นักท่องเที่ยว และผู้ใช้ใหม่เข้าถึง MRT ได้ง่ายขึ้น",
                    "ช่วยให้ผู้โดยสารเข้าใจนโยบาย 20 บาทจากทริปของตัวเอง ไม่ใช่จากข้อความข่าวที่อาจตีความยาก",
                    "ลดการพึ่งพารถส่วนตัวหรือแท็กซี่ในทริปที่ระบบรางสามารถรองรับได้",
                    "สนับสนุนเมืองที่เดินทางด้วยขนส่งสาธารณะมากขึ้น ลดมลพิษและคาร์บอนในระยะยาว",
                    "สร้างฐานข้อมูล/UX ที่ต่อยอดสู่บริการผู้โดยสารของ MRTA ในอนาคตได้",
                ],
            ),
            section(
                "ตัวชี้วัดที่เสนอ",
                "ก่อน-หลังใช้แอปสามารถวัด confidence score, จำนวนผู้ใช้ที่วางแผนสำเร็จ, เวลาที่ใช้ทำความเข้าใจเส้นทาง, ความผิดพลาดในการเลือกสาย/สถานี และจำนวนผู้ใช้ที่เลือกเดินทางด้วยระบบรางหลังทดลองใช้",
            ),
            PageBreak(),
        ]
    )

    # 10. Budget
    story.extend(
        [
            section(
                "10. งบประมาณ/ทรัพยากร",
                "สำหรับระดับ prototype ผลงานนี้ใช้งบประมาณต่ำมาก เพราะเป็นเว็บแอป static ที่ใช้ข้อมูลเปิด โครงสร้างเว็บมาตรฐาน และสามารถ deploy ผ่าน GitHub Pages ได้",
                [
                    "Prototype ปัจจุบัน: ใช้คอมพิวเตอร์ส่วนตัว, browser, JavaScript/Three.js, OpenStreetMap/open data และ GitHub Pages",
                    "ค่า server ระยะเริ่มต้น: 0 บาท หาก deploy แบบ static ผ่าน GitHub Pages",
                    "ค่าออกแบบ/ทดสอบ UX: ใช้การสัมภาษณ์และทดลองกับกลุ่มผู้ใช้จริง เช่น เพื่อนต่างจังหวัด นักเรียน ผู้ปกครอง",
                    "หากต่อยอดจริง: ควรมีงบสำหรับ API integration, data maintenance, server monitoring, UX research และ accessibility audit",
                    "ทรัพยากรที่ต้องการจากค่าย: คำแนะนำจากผู้เชี่ยวชาญ MRTA, ข้อมูลจริงที่สามารถเปิดเผยได้, feedback จากผู้ให้บริการ และแนวทางทำให้ถูกต้องตามระบบจริง",
                ],
            ),
            section(
                "สรุป",
                "Bangkok Transit 3D เริ่มจากปัญหาจริงของผู้โดยสารใหม่ โดยเฉพาะคนต่างจังหวัดที่ยังไม่มั่นใจในการใช้รถไฟฟ้ากรุงเทพฯ ผลงานนี้จึงไม่ได้พยายามแทนที่แอปทางการ แต่ทำหน้าที่เป็นสะพานก่อนการเดินทาง ช่วยให้ผู้ใช้เข้าใจระบบราง กล้าใช้ MRT มากขึ้น และเปิดทางให้ MRTA ต่อยอดประสบการณ์ผู้โดยสารด้วยข้อมูลจริงในอนาคต",
            ),
        ]
    )

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == "__main__":
    build()
