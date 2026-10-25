"""Compute peptide molecular formulas from sequences and compare to sourced formulas."""
import re
from collections import Counter

AA = {  # free amino acid formulas
 'G':'C2H5NO2','A':'C3H7NO2','S':'C3H7NO3','P':'C5H9NO2','V':'C5H11NO2','T':'C4H9NO3','C':'C3H7NO2S',
 'L':'C6H13NO2','I':'C6H13NO2','N':'C4H8N2O3','D':'C4H7NO4','Q':'C5H10N2O3','K':'C6H14N2O2','E':'C5H9NO4',
 'M':'C5H11NO2S','H':'C6H9N3O2','F':'C9H11NO2','R':'C6H14N4O2','Y':'C9H11NO3','W':'C11H12N2O2',
 'Aib':'C4H9NO2','Nle':'C6H13NO2','Nal':'C13H13NO2','Dmt':'C11H15NO3','pE':'C5H7NO3',
}
MASS = {'C':12.011,'H':1.008,'N':14.007,'O':15.999,'S':32.06,'Cu':63.546,'P':30.974,'Co':58.933,'I':126.904}

def parse(f):
    c=Counter()
    for el,n in re.findall(r'([A-Z][a-z]?)(\d*)', f):
        c[el]+=int(n or 1)
    return c

def fmt(c):
    order=['C','H','Cu','Co','I','N','O','P','S']
    return ''.join(f"{el}{c[el] if c[el]!=1 else ''}" for el in order if c.get(el))

def peptide(residues, amide=False, acetyl=False, disulfides=0, lactams=0, extra=None):
    c=Counter()
    for r in residues: c+=parse(AA[r])
    n=len(residues)
    c-=Counter({'H':2*(n-1),'O':n-1})
    if amide: c+=Counter({'N':1,'H':1}); c-=Counter({'O':1})
    if acetyl: c+=Counter({'C':2,'H':2,'O':1})
    c-=Counter({'H':2*disulfides})
    c-=Counter({'H':2*lactams,'O':lactams})
    if extra: c+=parse(extra)
    return c

def mw(c): return round(sum(MASS[e]*n for e,n in c.items()),2)

def seq(s): return list(s)

CHECKS = [
 ('BPC-157', peptide(seq('GEPPPGKPADDAGLV')), 'C62H98N16O22'),
 ('TB-500 fragment Ac-LKKTETQ', peptide(seq('LKKTETQ'), acetyl=True), 'C38H68N10O14'),
 ('Thymosin beta-4 (43 aa)', peptide(seq('SDKPDMAEIEKFDKSKLKKTETQEKNPLPSKETIEQEKQAGES'), acetyl=True), 'C212H350N56O78S'),
 ('Ipamorelin', peptide(['Aib','H','Nal','F','K'], amide=True), 'C38H49N9O5'),
 ('GHK', peptide(seq('GHK')), 'C14H24N6O4'),
 ('AHK', peptide(seq('AHK')), 'C15H26N6O4'),
 ('Mod GRF 1-29 (CJC-1295 no DAC)', peptide(seq('YADAIFTQSYRKVLAQLSARKLLQDILSR'), amide=True), 'C152H252N44O42'),
 ('Sermorelin GRF 1-29 NH2', peptide(seq('YADAIFTNSYRKVLGQLSARKLLQDIMSR'), amide=True), 'C149H246N44O42S'),
 ('DSIP', peptide(seq('WAGGDASGE')), 'C35H48N10O15'),
 ('Epitalon', peptide(seq('AEDG')), 'C14H22N4O9'),
 ('Humanin', peptide(seq('MAPRGFSCLLLLTSEIDLPVKRRA')), 'C119H204N34O32S2'),
 ('Kisspeptin-10 human', peptide(seq('YNWNSFGLRF'), amide=True), 'C63H83N17O14'),
 ('KPV', peptide(seq('KPV')), 'C16H30N4O4'),
 ('LL-37', peptide(seq('LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES')), 'C205H340N60O53'),
 ('Melanotan I (afamelanotide)', peptide(['S','Y','S','Nle','E','H','F','R','W','G','K','P','V'], amide=True, acetyl=True), 'C78H111N21O19'),
 ('Melanotan II', peptide(['Nle','D','H','F','R','W','K'], amide=True, acetyl=True, lactams=1), 'C50H69N15O9'),
 ('Bremelanotide (PT-141)', peptide(['Nle','D','H','F','R','W','K'], acetyl=True, lactams=1), 'C50H68N14O10'),
 ('MOTS-c', peptide(seq('MRWQEMGYIFYPRKLR')), 'C101H152N28O22S2'),
 ('Oxytocin', peptide(seq('CYIQNCPLG'), amide=True, disulfides=1), 'C43H66N12O12S2'),
 ('Pinealon', peptide(seq('EDR')), 'C15H26N6O8'),
 ('Cartalax (AED)', peptide(seq('AED')), None),
 ('Selank', peptide(seq('TKPRPGP')), 'C33H57N11O9'),
 ('Semax', peptide(seq('MEHFPGP')), 'C37H51N9O10S'),
 ('SS-31', peptide(['R','Dmt','K','F'], amide=True), 'C32H49N9O5'),
 ('Thymosin alpha-1', peptide(seq('SDAAVDTSSEITTKDLKEKKEVVEEAEN'), acetyl=True), 'C129H215N33O55'),
 ('Thymulin', peptide(['pE']+seq('AKSQGGSN')), 'C33H54N12O15'),
 ('VIP', peptide(seq('HSDAVFTDNYTRLRKQMAVKKYLNSILN'), amide=True), 'C147H238N44O42S'),
 ('ARA-290', peptide(['pE']+seq('EQLERALNSS')), 'C51H84N16O21'),
 ('AOD9604 (YLRIVQCRSVEGSCGF, disulfide)', peptide(seq('YLRIVQCRSVEGSCGF'), disulfides=1), 'C78H123N23O23S2'),
]

if __name__ == '__main__':
    bad = 0
    for name, c, expected in CHECKS:
        got = fmt(c)
        ok = expected is None or parse(got) == parse(expected)
        bad += 0 if ok else 1
        print(f"{'OK ' if ok else 'BAD'} {name:42} computed {got:20} MW {mw(c):>9}  source {expected or '-'}")
    print('mismatches:', bad)
