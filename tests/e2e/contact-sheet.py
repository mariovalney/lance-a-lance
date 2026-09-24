# Joins screenshots side by side: python3 contact-sheet.py out.png a.png b.png ...
import sys
from PIL import Image
out=sys.argv[1]; names=sys.argv[2:]
ims=[Image.open(n).resize((390,844)) for n in names]
s=Image.new('RGB',(390*len(ims),844),'white')
for i,im in enumerate(ims): s.paste(im,(i*390,0))
s.save(out)
