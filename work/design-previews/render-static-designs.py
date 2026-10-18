"""Export the three layout concepts as static design boards, not browser screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import numpy as np

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
S = 2
W, H = 1024, 1130
INK, MUTED, PURPLE = '#292542', '#6c6884', '#794ce9'
REGULAR = '/System/Library/Fonts/STHeiti Light.ttc'
BOLD = '/System/Library/Fonts/STHeiti Medium.ttc'
COVER = Image.open(ROOT / 'static/images/published/自我剖析/学会做一个松弛感拉满的人/松弛的夜晚.png').convert('RGB')
AVATAR = Image.open(ROOT / 'static/images/IMG_5943.JPG').convert('RGB')

POSTS = [
    ('2026.10.17', '自我剖析', '学会做一个松弛感拉满的人', '事情还悬而未决，但是我不会跟着一起悬在那里', '3 分钟阅读'),
    ('2026.10.03', 'AI 应用开发', 'AgentScope 核心知识总结：理解 Agent 的运行机制与工程边界', '从消息、工具到状态管理，理解框架如何把一次对话，组织成一个可靠的 Agent 应用。', '12 分钟阅读'),
    ('2026.09.27', '心理学', '何谓 Paltering？', '不是“说假话”，而是利用真话让对方得出错误结论。', '#心理学'),
    ('2026.09.27', '播客', '03期｜微信张小龙：没有产品，只有人性。', '关于张小龙产品观与人性洞察的播客笔记', '#产品思维'),
    ('2026.07.23', '看剧', '《心跳漏一拍》全系列看剧有感', '', '#生活记录'),
]

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REGULAR, round(size * S))

def text(canvas, xy, value, size=14, color=INK, bold=False):
    ImageDraw.Draw(canvas).text((round(xy[0]*S), round(xy[1]*S)), value, font=font(size,bold), fill=color)

def lines(value, width, size, bold=False):
    result, line = [], ''
    f = font(size,bold)
    for char in value:
        if line and f.getlength(line+char) > width*S:
            result.append(line)
            line = char
        else:
            line += char
    if line:
        result.append(line)
    return result

def paragraph(canvas, xy, value, width, size=14, color=INK, bold=False, leading=None):
    leading = leading or size*1.6
    for index,line in enumerate(lines(value,width,size,bold)):
        text(canvas,(xy[0],xy[1]+index*leading),line,size,color,bold)
    return len(lines(value,width,size,bold))*leading

def rounded(canvas, rect, fill='#faf8fe', radius=18, shadow=False):
    box = tuple(round(v*S) for v in rect)
    if shadow:
        layer = Image.new('RGBA',canvas.size)
        ImageDraw.Draw(layer).rounded_rectangle((box[0],box[1]+12,box[2],box[3]+12),radius*S,fill=(90,70,110,20))
        canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(16)))
    ImageDraw.Draw(canvas).rounded_rectangle(box,radius*S,fill=fill,outline='#ffffff',width=2)

def photo(canvas, rect, rounded_radius=18, center=(.5,.5)):
    x,y,w,h = rect
    size = (round(w*S),round(h*S))
    fitted = ImageOps.fit(COVER,size,Image.Resampling.LANCZOS,centering=center)
    mask = Image.new('L',size)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,*size),rounded_radius*S,fill=255)
    canvas.paste(fitted,(round(x*S),round(y*S)),mask)

def backdrop():
    yy,xx = np.mgrid[0:H*S,0:W*S].astype(np.float32)
    xx /= W*S
    yy /= H*S
    rgb = np.zeros((H*S,W*S,3),dtype=np.float32)+np.array([242,238,251])
    for x,y,color,strength in [(0,0,[184,200,250],.85),(1,.08,[244,191,220],.87),(0,.85,[190,234,226],.8),(.92,.85,[251,226,193],.8)]:
        alpha = np.exp(-((xx-x)**2+(yy-y)**2)*3.2)*strength
        rgb = rgb*(1-alpha[...,None])+np.array(color)*alpha[...,None]
    return Image.fromarray(rgb.clip(0,255).astype('uint8')).convert('RGBA')

def shell(name, subtitle):
    canvas = backdrop()
    text(canvas,(24,18),name,19,PURPLE,True)
    text(canvas,(24,47),subtitle,12,MUTED)
    top = 90
    avatar = ImageOps.fit(AVATAR,(76*S,76*S),Image.Resampling.LANCZOS)
    mask = Image.new('L',avatar.size)
    ImageDraw.Draw(mask).ellipse((0,0,76*S,76*S),fill=255)
    canvas.paste(avatar,(24*S,top*S),mask)
    ImageDraw.Draw(canvas).ellipse((24*S,top*S,100*S,(top+76)*S),outline='white',width=3*S)
    rounded(canvas,(79,top+50,109,top+80),'#e9e0fc',15)
    text(canvas,(87,top+57),'茶',12,PURPLE)
    text(canvas,(24,top+91),'ALong',25,INK,True)
    text(canvas,(101,top+95),'。',21,PURPLE,True)
    text(canvas,(24,top+130),'持续发疯ing',12,MUTED)
    for index,label in enumerate(['首页','Writing','Projects','About','Now','搜索']):
        y = top+186+index*51
        if index == 0:
            rounded(canvas,(16,y-8,151,y+33),'#dfe5fd',13)
        text(canvas,(35,y),label,14,PURPLE if index==0 else INK)
    text(canvas,(24,top+540),'GitHub ↗   Email ↗',11,MUTED)
    rounded(canvas,(180,top,820,top+162),'#f7f3fd',23,True)
    text(canvas,(205,top+22),'今日灵感',11,PURPLE,True)
    text(canvas,(712,top+22),'10月18日 星期日',10,MUTED)
    text(canvas,(205,top+58),'本以高难饱，徒劳恨费声。',29,INK,True)
    text(canvas,(205,top+128),'— 蝉 · 一言 ↗',11,MUTED)
    text(canvas,(728,top+128),'翻阅文章 ↗',11,PURPLE)
    text(canvas,(180,top+191),'WRITING',11,PURPLE,True)
    text(canvas,(180,top+215),'最近文章',24,INK,True)
    text(canvas,(735,top+227),'全部 Writing ↗',11,MUTED)
    rounded(canvas,(844,top+7,1000,top+48),'#fae8f7',13,True)
    text(canvas,(857,top+20),'搜索文章          ↗',11,PURPLE)
    text(canvas,(844,top+89),'最近更新',11,PURPLE,True)
    y = top+121
    for date,category,title,description,time in POSTS:
        used = paragraph(canvas,(844,y),title,121,11,leading=18)
        text(canvas,(974,y),date[5:],10,MUTED)
        y += max(40,used+20)
    y += 12
    text(canvas,(844,y),'标签',11,PURPLE,True)
    x = 844
    y += 32
    for label in ['#Agent','#Agentscope','#播客','#产品思维','#心理学','#学习记录','#自我剖析']:
        width = font(10).getlength(label)/S+17
        if x+width>1000:
            x,y=844,y+31
        rounded(canvas,(x,y,x+width,y+24),'#f6eaf2',12)
        text(canvas,(x+8,y+6),label,10,MUTED)
        x += width+6
    y += 70
    rounded(canvas,(844,y,1000,y+141),'#e6d8ed',16)
    text(canvas,(859,y+18),'现在',11,PURPLE,True)
    paragraph(canvas,(859,y+48),'我现在正在学习、构建和关注什么。',125,11,MUTED)
    text(canvas,(859,y+111),'正在发生 ↗',11)
    return canvas,top+267

def card(canvas,index,x,y,w=311,cover=False):
    date,category,title,description,time = POSTS[index]
    pad = 19
    image_h = round(w/1.33) if cover else 0
    title_h = len(lines(title,w-2*pad,18,True))*27
    desc_h = len(lines(description,w-2*pad,12))*20
    height = image_h+pad+17+12+title_h+8+desc_h+25+15+pad
    rounded(canvas,(x,y,x+w,y+height),'#f8f8fc' if x==180 else '#fff5eb',19,True)
    if cover:
        photo(canvas,(x+1,y+1,w-2,image_h+17),18)
        ImageDraw.Draw(canvas).rectangle(((x+1)*S,(y+image_h-1)*S,(x+w-1)*S,(y+image_h+18)*S),fill='#f8f8fc')
    cy = y+image_h+pad
    text(canvas,(x+pad,cy),f'{date}   {category}',11,MUTED)
    cy += 29
    paragraph(canvas,(x+pad,cy),title,w-2*pad,18,INK,True,27)
    cy += title_h+8
    paragraph(canvas,(x+pad,cy),description,w-2*pad,12,MUTED,leading=20)
    text(canvas,(x+pad,y+height-pad-13),time,10,MUTED)
    text(canvas,(x+w-84,y+height-pad-13),'阅读全文 ↗',11)
    return y+height+18

def poster(canvas,x,y,w=311,h=460):
    rounded(canvas,(x,y,x+w,y+h),'#30364c',19,True)
    photo(canvas,(x+1,y+1,w-2,h-2),18,center=(.43,.5))
    shade = np.zeros((h*S,w*S,4),dtype=np.uint8)
    shade[:,:,:3] = [24,27,45]
    shade[:,:,3] = (np.clip(np.linspace(-.3,1,h*S),0,1)*240).astype(np.uint8)[:,None]
    overlay = Image.fromarray(shade)
    mask = Image.new('L',overlay.size)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,w*S,h*S),19*S,fill=255)
    overlay.putalpha(Image.composite(overlay.getchannel('A'),Image.new('L',overlay.size),mask))
    canvas.alpha_composite(overlay,(x*S,y*S))
    rounded(canvas,(x+17,y+17,x+140,y+43),'#30354c',13)
    text(canvas,(x+29,y+24),'LIFE · 生活切片',10,'#ffffff')
    text(canvas,(x+21,y+h-215),'2026.10.17   自我剖析',11,'#efe8f6')
    paragraph(canvas,(x+21,y+h-183),POSTS[0][2],w-42,28,'#ffffff',True,40)
    paragraph(canvas,(x+21,y+h-94),POSTS[0][3],w-42,12,'#f3edf6',leading=21)
    text(canvas,(x+21,y+h-32),'3 分钟阅读',10,'#efe8f6')
    text(canvas,(x+w-85,y+h-32),'阅读全文 ↗',11,'#ffffff')
    return y+h+18

def feature(canvas,y):
    x,w,h=180,640,302
    rounded(canvas,(x,y,x+w,y+h),'#faf7f0',19,True)
    photo(canvas,(x+1,y+1,327,h-2),18,center=(.43,.5))
    ImageDraw.Draw(canvas).rectangle(((x+309)*S,(y+1)*S,(x+328)*S,(y+h-1)*S),fill='#faf7f0')
    tx=x+350
    text(canvas,(tx,y+31),'COVER STORY / 封面故事',10,PURPLE)
    text(canvas,(tx,y+61),'2026.10.17  自我剖析',10,MUTED)
    paragraph(canvas,(tx,y+96),POSTS[0][2],262,27,INK,True,40)
    paragraph(canvas,(tx,y+188),POSTS[0][3],262,12,MUTED,leading=21)
    text(canvas,(tx,y+h-37),'3 分钟阅读',10,MUTED)
    text(canvas,(x+w-90,y+h-37),'阅读全文 ↗',11)
    return y+h+18

def render_originals():
    for variant,name,subtitle in [
        ('a','A · 轻盈瀑布流','顶部封面 + 独立列高，图文卡片自然错落'),
        ('b','B · 沉浸海报流','大幅封面 + 标题叠图，让生活随笔更有氛围'),
        ('c','C · 杂志跨栏流','封面文章横跨双列，下方文字卡片保持错落'),
    ]:
        canvas,y=shell(name,subtitle)
        if variant=='a':
            left=card(canvas,0,180,y,cover=True)
            card(canvas,3,180,left)
            right=card(canvas,1,509,y)
            right=card(canvas,2,509,right)
            card(canvas,4,509,right)
        elif variant=='b':
            left=poster(canvas,180,y)
            card(canvas,3,180,left)
            right=card(canvas,1,509,y+27)
            right=card(canvas,2,509,right)
            card(canvas,4,509,right)
        else:
            y=feature(canvas,y)
            left=card(canvas,1,180,y)
            card(canvas,4,180,left)
            right=card(canvas,2,509,y+30)
            card(canvas,3,509,right)
        destination=OUT/f'design-{variant}.png'
        canvas.convert('RGB').save(destination,optimize=True)
        print(destination)


if __name__ == '__main__':
    render_originals()
