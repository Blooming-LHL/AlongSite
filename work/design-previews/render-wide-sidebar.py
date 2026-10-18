"""Static A revision: consolidate utility sidebar on the left; widen both article columns."""
import importlib.util
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('design_base', OUT/'render-static-designs.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.W, base.H = 1280, 1215

S = base.S
INK, MUTED, PURPLE = base.INK, base.MUTED, base.PURPLE
canvas = base.backdrop()
text, paragraph, rounded = base.text, base.paragraph, base.rounded
LEFT, SIDE_W, MAIN, MAIN_W = 28, 204, 272, 980
GAP = 24
COL_W = (MAIN_W-GAP)//2
checks = []

text(canvas,(LEFT,18),'A · 轻盈瀑布流 / 左侧整合版',20,PURPLE,True)
text(canvas,(LEFT,49),'保留封面高卡片，把右侧信息收进左栏，让双列文章舒展开来',13,MUTED)

# All previous right-sidebar sections are retained in this single left rail.
top = 96
avatar = ImageOps.fit(base.AVATAR,(80*S,80*S),Image.Resampling.LANCZOS)
mask = Image.new('L',avatar.size)
ImageDraw.Draw(mask).ellipse((0,0,80*S,80*S),fill=255)
canvas.paste(avatar,(LEFT*S,top*S),mask)
ImageDraw.Draw(canvas).ellipse((LEFT*S,top*S,(LEFT+80)*S,(top+80)*S),outline='white',width=3*S)
rounded(canvas,(LEFT+60,top+56,LEFT+94,top+90),'#ece4ff',17)
text(canvas,(LEFT+71,top+65),'茶',12,PURPLE)
text(canvas,(LEFT+106,top+12),'ALong',25,INK,True)
text(canvas,(LEFT+182,top+16),'。',21,PURPLE,True)
text(canvas,(LEFT+106,top+54),'持续发疯ing',12,MUTED)

y = top+116
rounded(canvas,(LEFT,y,LEFT+SIDE_W,y+44),'#f4eafc',14,True)
text(canvas,(LEFT+15,y+15),'搜索文章',13,MUTED)
text(canvas,(LEFT+SIDE_W-27,y+15),'↗',13,PURPLE)

nav_y = y+67
for index,label in enumerate(['首页','Writing','Projects','About','Now']):
    cy = nav_y+index*39
    if index==0:
        rounded(canvas,(LEFT-6,cy-10,LEFT+SIDE_W,cy+26),'#e4e5fc',12)
    text(canvas,(LEFT+14,cy),label,14,PURPLE if index==0 else INK)

y = nav_y+5*39+18
ImageDraw.Draw(canvas).line((LEFT*S,y*S,(LEFT+SIDE_W)*S,y*S),fill='#f8f4fc',width=2)
y += 24
text(canvas,(LEFT,y),'最近更新',12,PURPLE,True)
y += 32
for date,category,title,description,time in base.POSTS:
    height = paragraph(canvas,(LEFT,y),title,SIDE_W-42,11,leading=18)
    text(canvas,(LEFT+SIDE_W-33,y+1),date[5:],10,MUTED)
    y += max(38,height+17)

y += 15
text(canvas,(LEFT,y),'标签',12,PURPLE,True)
tag_y = y+31
tag_x = LEFT
for label in ['#Agent','#Agentscope','#播客','#产品思维','#心理学','#学习记录','#自我剖析']:
    width = base.font(11).getlength(label)/S+19
    if tag_x+width > LEFT+SIDE_W:
        tag_x,tag_y=LEFT,tag_y+32
    rounded(canvas,(tag_x,tag_y,tag_x+width,tag_y+25),'#f2eaf7',13)
    text(canvas,(tag_x+9,tag_y+6),label,11,MUTED)
    tag_x += width+7

y = tag_y+60
rounded(canvas,(LEFT,y,LEFT+SIDE_W,y+123),'#e4dcef',16)
text(canvas,(LEFT+16,y+18),'现在',12,PURPLE,True)
paragraph(canvas,(LEFT+16,y+47),'我现在正在学习、构建和关注什么。',SIDE_W-32,12,MUTED,leading=21)
text(canvas,(LEFT+16,y+95),'正在发生 ↗',12)
text(canvas,(LEFT,y+151),'GitHub ↗     Email ↗',12,MUTED)
checks.append(('sidebar',y+172))

# Same inspiration block and A-style article cards, now without a right rail.
rounded(canvas,(MAIN,top,MAIN+MAIN_W,top+179),'#f8f5ff',25,True)
text(canvas,(MAIN+30,top+26),'今日灵感',12,PURPLE,True)
text(canvas,(MAIN+MAIN_W-135,top+26),'10月18日 星期日',11,MUTED)
text(canvas,(MAIN+30,top+66),'本以高难饱，徒劳恨费声。',37,INK,True)
text(canvas,(MAIN+30,top+145),'— 蝉 · 一言 ↗',12,MUTED)
text(canvas,(MAIN+MAIN_W-115,top+145),'翻阅文章 ↗',12,PURPLE)
text(canvas,(MAIN,top+210),'WRITING',12,PURPLE,True)
text(canvas,(MAIN,top+236),'最近文章',27,INK,True)
text(canvas,(MAIN+MAIN_W-108,top+249),'全部 Writing ↗',12,MUTED)

def wide_card(index,x,y,cover=False):
    date,category,title,description,time = base.POSTS[index]
    pad=25
    available=COL_W-2*pad
    title_h=len(base.lines(title,available,21,True))*32
    description_h=len(base.lines(description,available,14))*23
    image_h=round(COL_W/1.5) if cover else 0
    body_h=pad+17+16+title_h+10+description_h+30+17+pad
    height=body_h+image_h
    fill='#f8f8fc' if x==MAIN else '#fff5eb'
    rounded(canvas,(x,y,x+COL_W,y+height),fill,21,True)
    if cover:
        base.photo(canvas,(x+1,y+1,COL_W-2,image_h+21),21)
        ImageDraw.Draw(canvas).rectangle(((x+1)*S,(y+image_h)*S,(x+COL_W-1)*S,(y+image_h+22)*S),fill=fill)
    cy=y+image_h+pad
    text(canvas,(x+pad,cy),f'{date}    {category}',12,MUTED)
    cy+=33
    paragraph(canvas,(x+pad,cy),title,available,21,INK,True,32)
    cy+=title_h+10
    paragraph(canvas,(x+pad,cy),description,available,14,MUTED,leading=23)
    text(canvas,(x+pad,y+height-pad-15),time,12,MUTED)
    text(canvas,(x+COL_W-pad-77,y+height-pad-15),'阅读全文 ↗',12)
    checks.append((f'article-{index}',y+height))
    return y+height+GAP

start_y=top+290
left_y=wide_card(0,MAIN,start_y,cover=True)
wide_card(3,MAIN,left_y)
right_x=MAIN+COL_W+GAP
right_y=wide_card(1,right_x,start_y)
right_y=wide_card(2,right_x,right_y)
wide_card(4,right_x,right_y)

for name,bottom in checks:
    assert bottom < base.H-16, (name,bottom,base.H)
assert MAIN+2*COL_W+GAP == base.W-28
destination=OUT/'design-a-left-sidebar.png'
canvas.convert('RGB').save(destination,optimize=True)
print(destination)
print(f'Layout checked: left rail {SIDE_W}px; article area {MAIN_W}px; cards {COL_W}px; gap {GAP}px.')
