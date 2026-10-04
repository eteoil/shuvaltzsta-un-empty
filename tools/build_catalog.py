# アイテムとエネミーの一覧表（アーティファクトのページ）を、ゲームのデータから作る。
# 使い方: python3 tools/build_catalog.py 出力先.html
# 読むもの: data/items.json・data/enemies/*.json・data/patterns/*.json・data/npcs/*.json・data/maps/*.json・data/gameConfig.json
import json
import glob
import os
import sys
from collections import Counter

ROOT = os.path.join(os.path.dirname(__file__), '..')


def load(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return json.load(f)


items = load('data/items.json')
config = load('data/gameConfig.json')
npcs = {os.path.basename(p)[:-5]: load(p) for p in glob.glob(os.path.join(ROOT, 'data/npcs/*.json'))}
maps = [load(p) for p in sorted(glob.glob(os.path.join(ROOT, 'data/maps/*.json')))]
patterns = {os.path.basename(p)[:-5]: load(p) for p in glob.glob(os.path.join(ROOT, 'data/patterns/*.json'))}
enemies = [load(p) for p in sorted(glob.glob(os.path.join(ROOT, 'data/enemies/*.json')))]

pct = lambda r: f"{round(r[0] * 100 / r[1])}%"
name = lambda i: items[i]['name'] if i in items else i
reg = config['status']['regen']

# ---- アイテムの効果
def effect(i, d):
    out = []
    if 'heal' in d:
        out.append(f"HPを最大HPの{pct(d['heal'])}回復")
    if 'regen' in d:
        r = d['regen']
        out.append(f"最大HPの{pct(r['rate'])}ずつ{r['ticks']}回回復（探索中は{reg['fieldTickSec']}秒ごと、戦闘中は{reg['tickBeats']}拍ごと）")
    if 'damage' in d:
        out.append(f"最大HPの{pct(d['damage'])}のダメージ（HPは1残る）")
    if d.get('poison'):
        out.append('毒になる')
    if d.get('cure') == 'poison':
        out.append('毒が治る')
    if 'buff' in d:
        out.append(f"{d.get('useText', '')}（{d['beats']}拍）")
    if 'outcomes' in d:
        names = '・'.join(name(o) for o in d['outcomes'])
        if d.get('battleOnly'):
            out.append(f"{names}のどれかの効果が出る" + ('（長さ2倍）' if d.get('durationRate') == 2 else ''))
        else:
            out.append(f"食べると{names}のどちらか（コウが鑑定できる）")
    return '。'.join(out)


def kind(d):
    if 'heal' in d or 'regen' in d:
        return '回復'
    if d.get('battleOnly'):
        return '戦闘'
    if 'cure' in d or 'damage' in d or 'outcomes' in d:
        return 'その他'
    return '素材'


# ---- 手に入る所・売れる所
where = {i: [] for i in items}
sell = {i: [] for i in items}
for npc_id, n in npcs.items():
    for o in n.get('options', []):
        s = o.get('shop')
        if s:
            day = {i: p for i, p, *_ in s.get('items', [])}
            night = {i: p for i, p, *_ in s.get('nightItems', [])}
            for i in set(day) | set(night):
                when = '' if not night else '昼' if i not in night else '夜' if i not in day else ''
                price = day.get(i, night.get(i))
                notes = [f"{when}だけ"] if when else []
                if s.get('festivalSale'):
                    notes.append(f"祭りの日は{round((1 - s['festivalSale']) * 100)}%引き")
                where[i].append({'how': '買う', 'who': n['name'], 'price': price, 'note': '・'.join(notes)})
            for i, p, *lim in s.get('festivalItems', []):
                where[i].append({'how': '買う', 'who': n['name'], 'price': p, 'note': f"祭りの日だけ・1日{lim[0]}個まで" if lim else '祭りの日だけ'})
        t = o.get('trade')
        if t:
            cnt = t.get('giveCount', 1)
            cost = f"{name(t['give'])}×{cnt}" + (f"＋{t['price']:,}$" if t.get('price') else '')
            where[t['get']].append({'how': '交換', 'who': n['name'], 'price': None, 'note': cost})
        b = o.get('buy')
        if b:
            if 'prices' in b:
                for i, p in b['prices'].items():
                    sell[i].append({'who': n['name'], 'price': p})
            else:
                for i, d in items.items():
                    if 'sell' in d:
                        sell[i].append({'who': n['name'], 'price': d['sell']})
        a = o.get('appraise')
        if a:
            for r in a['results']:
                where[r].append({'how': '鑑定', 'who': n['name'], 'price': None, 'note': f"{name(a['item'])}を見てもらう"})

for m in maps:
    pk = m.get('pickups')
    if isinstance(pk, dict) and pk.get('table'):
        total = sum(w for _, w in pk['table'])
        for i, w in pk['table']:
            where[i].append({'how': '拾う', 'who': m['name'], 'price': None, 'note': f"落ちている物の{round(w * 100 / total)}%"})
for e in enemies:
    if e.get('drop'):
        where[e['drop']].append({'how': '落とす', 'who': e['name'], 'price': None, 'note': '倒すと落とす'})
for i, c in config['start']['items'].items():
    where[i].append({'how': '最初', 'who': 'はじめから', 'price': None, 'note': f"{c}個持っている"})

item_rows = [{
    'id': i, 'name': d['name'], 'desc': d.get('desc', ''), 'kind': kind(d), 'effect': effect(i, d),
    'battleOnly': bool(d.get('battleOnly')), 'where': where[i], 'sell': sell[i],
} for i, d in items.items()]

# ---- エネミー
AREA = {'front1': '正面1マス', 'front3': '正面3マス', 'around': 'まわり', 'around2': 'まわり2マス', 'line3': 'まっすぐ3マス'}
where_enemy = {e['id']: Counter() for e in enemies}
for m in maps:
    for k in ('spawns', 'encounters'):
        for s in m.get(k) or []:
            if isinstance(s, dict) and s.get('enemy') in where_enemy:
                where_enemy[s['enemy']][m['name']] += 1
enemy_rows = []
for e in enemies:
    moves = []
    for pid in e['patterns']:
        p = patterns.get(pid)
        if not p:
            continue
        for ev in p['events']:
            if ev['type'] == 'enemy.attack':
                moves.append({'area': AREA.get(ev['payload'].get('area'), ev['payload'].get('area')), 'power': ev['payload']['power']})
    seen = set()
    uniq = [mv for mv in moves if (mv['area'], mv['power']) not in seen and not seen.add((mv['area'], mv['power']))]
    uniq.sort(key=lambda mv: mv['power'])
    powers = [mv['power'] for mv in moves]
    enemy_rows.append({
        'id': e['id'], 'name': e['name'], 'boss': bool(e.get('boss')), 'hp': e['hp'], 'aggro': e.get('aggro'),
        'min': min(powers) if powers else None, 'max': max(powers) if powers else None, 'moves': uniq,
        'drop': name(e['drop']) if e.get('drop') else None, 'faints': bool(e.get('faints')),
        'where': [{'map': k, 'n': v} for k, v in where_enemy[e['id']].items()],
        'score': None if e.get('boss') else config['dungeon']['killScore'],
    })

rules = {
    'heroHp': config['battle']['player']['hp'], 'hpPerLevel': config['level']['hpPerLevel'],
    'rest': config['restDay']['enemyHp'], 'taboo': config['taboo']['enemyHp'],
}

data = json.dumps({'items': item_rows, 'enemies': enemy_rows, 'rules': rules}, ensure_ascii=False)
tpl = open(os.path.join(os.path.dirname(__file__), 'catalog_template.html'), encoding='utf-8').read()
out = sys.argv[1] if len(sys.argv) > 1 else 'catalog.html'
open(out, 'w', encoding='utf-8').write(tpl.replace('/*DATA*/null', data))
print(out, len(item_rows), 'items', len(enemy_rows), 'enemies')
