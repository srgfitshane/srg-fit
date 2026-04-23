from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "srg-fit-home-screen-guide.pdf"
SHIELD = ROOT / "public" / "SRG Shield.png"

BG = colors.HexColor("#080810")
PANEL = colors.HexColor("#11131C")
TEAL = colors.HexColor("#00C9B1")
ORANGE = colors.HexColor("#F5A623")
TEXT = colors.HexColor("#F3F4F7")
MUTED = colors.HexColor("#B9C0CD")
LINE = colors.HexColor("#243042")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="GuideTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            alignment=TA_CENTER,
            textColor=TEXT,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="GuideSubtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=15,
            alignment=TA_CENTER,
            textColor=MUTED,
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=TEXT,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyDark",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=TEXT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallDark",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=MUTED,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CardHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=TEXT,
            spaceAfter=4,
        )
    )
    return styles


def page_background(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(BG)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setStrokeColor(colors.Color(1, 1, 1, alpha=0.06))
    canvas.setLineWidth(0.7)
    for y in (height - 70, 58):
        canvas.line(42, y, width - 42, y)

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(42, 44, "SRG Fit home screen install guide")
    canvas.drawRightString(width - 42, 44, f"Page {doc.page}")
    canvas.restoreState()


def step_table(title, blurb, steps, styles):
    rows = [
        [Paragraph(f"<b>{i}.</b>", styles["BodyDark"]), Paragraph(text, styles["BodyDark"])]
        for i, text in enumerate(steps, start=1)
    ]
    table = Table(rows, colWidths=[0.45 * inch, 6.15 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.8, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#0E1621")),
            ]
        )
    )
    return [
        Paragraph(title, styles["CardHeading"]),
        Paragraph(blurb, styles["SmallDark"]),
        Spacer(1, 6),
        table,
    ]


def note_box(lines, styles):
    content = [Paragraph("<b>Tips</b>", styles["CardHeading"])]
    for line in lines:
        content.append(Paragraph(line, styles["BodyDark"]))

    table = Table([[content]], colWidths=[6.6 * inch], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0C1A1B")),
                ("BOX", (0, 0), (-1, -1), 1, TEAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def main():
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=42,
        rightMargin=42,
        topMargin=56,
        bottomMargin=64,
    )

    story = []

    if SHIELD.exists():
        story.append(Image(str(SHIELD), width=1.6 * inch, height=1.6 * inch))
        story.append(Spacer(1, 14))

    story.extend(
        [
            Paragraph("Add SRG Fit To Your Home Screen", styles["GuideTitle"]),
            Paragraph(
                "A quick guide for installing the SRG Fit web app on Android, iPhone, and iPad. "
                "Once added, SRG Fit launches like an app right from your home screen.",
                styles["GuideSubtitle"],
            ),
            Spacer(1, 10),
            note_box(
                [
                    "Start by opening the SRG Fit web app in your phone or tablet browser and signing in.",
                    "Button names can vary slightly by browser version, but the flow is the same.",
                    "If you do not see the install option on iPhone or iPad, make sure you are using Safari.",
                ],
                styles,
            ),
            Spacer(1, 20),
            Paragraph("What you will get", styles["SectionTitle"]),
            Paragraph(
                "Installing SRG Fit to your home screen gives you one-tap access, a full-screen app feel, "
                "and a faster path back to workouts, nutrition, check-ins, and messages.",
                styles["BodyDark"],
            ),
            Spacer(1, 8),
        ]
    )

    intro_table = Table(
        [
            [
                Paragraph("<b>Android</b><br/>Chrome or Samsung Internet", styles["BodyDark"]),
                Paragraph("<b>iPhone</b><br/>Safari", styles["BodyDark"]),
                Paragraph("<b>iPad</b><br/>Safari", styles["BodyDark"]),
            ]
        ],
        colWidths=[2.15 * inch, 2.15 * inch, 2.15 * inch],
        hAlign="LEFT",
    )
    intro_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PANEL),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 1, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("TEXTCOLOR", (0, 0), (-1, -1), TEXT),
            ]
        )
    )
    story.append(intro_table)
    story.append(PageBreak())

    story.extend(
        [
            Paragraph("Android", styles["SectionTitle"]),
            Paragraph(
                "These steps usually work in Chrome and Samsung Internet. The button may say "
                '"Install app" or "Add to Home screen."',
                styles["BodyDark"],
            ),
            Spacer(1, 8),
        ]
    )
    story.extend(
        step_table(
            "How to install on Android",
            "Open the SRG Fit website in your browser first.",
            [
                "Tap the browser menu in the top-right corner.",
                'Look for "Install app" or "Add to Home screen."',
                'Tap the install option, then confirm by tapping "Install" or "Add."',
                "Find the SRG Fit icon on your home screen and tap it to launch the app.",
            ],
            styles,
        )
    )
    story.append(Spacer(1, 16))
    story.append(
        note_box(
            [
                'If "Install app" is missing, try "Add to Home screen" instead.',
                "If you already have the page open in a tab, refresh once before checking the menu again.",
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        [
            Paragraph("iPhone", styles["SectionTitle"]),
            Paragraph(
                "On iPhone, the install flow needs to be done in Safari. Other browsers on iPhone do not always show the correct option.",
                styles["BodyDark"],
            ),
            Spacer(1, 8),
        ]
    )
    story.extend(
        step_table(
            "How to install on iPhone",
            "Open the SRG Fit website in Safari.",
            [
                "Tap the Share button at the bottom of the screen.",
                'Scroll down and tap "Add to Home Screen."',
                "Rename the shortcut if you want, then tap Add in the top-right corner.",
                "The SRG Fit icon will appear on your home screen. Tap it any time to open the app.",
            ],
            styles,
        )
    )
    story.append(Spacer(1, 16))
    story.append(
        note_box(
            [
                'If you do not see "Add to Home Screen," scroll farther down in the Share sheet.',
                "If the Share button is hidden, tap once near the bottom of Safari to make the toolbar reappear.",
            ],
            styles,
        )
    )
    story.append(PageBreak())

    story.extend(
        [
            Paragraph("iPad", styles["SectionTitle"]),
            Paragraph(
                "The iPad setup is almost the same as iPhone, but the Share button is usually near the top-right corner in Safari.",
                styles["BodyDark"],
            ),
            Spacer(1, 8),
        ]
    )
    story.extend(
        step_table(
            "How to install on iPad",
            "Open the SRG Fit website in Safari.",
            [
                "Tap the Share button near the top-right of Safari.",
                'Choose "Add to Home Screen."',
                "Tap Add to confirm.",
                "Look for the SRG Fit icon on your iPad home screen and launch it from there.",
            ],
            styles,
        )
    )
    story.append(Spacer(1, 16))
    story.append(
        note_box(
            [
                "If you use Stage Manager or Split View, the icon may land on a different home screen page than expected.",
                "You can press and hold the new icon and move it anywhere you want.",
            ],
            styles,
        )
    )

    doc.build(story, onFirstPage=page_background, onLaterPages=page_background)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
