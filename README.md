# shuvaltzsta-un-empty
8bit風リズムRPG（制作中）

# シュバルツスタ-ʌ'n*empty-

8ビット風リズムバトルRPG（ブラウザゲーム）。上位文書は「アンエプ開発憲法 Ver.1.2」と「イベントデータ設計案 v0.3」。食い違ったときは憲法が優先する。

いまできていること：タイトル → 探索（スラム） → 会話 → リズムバトル（チャック＆ジッパー） → 決着 → 探索、の1周。

## 動かし方

`data/*.json` を `fetch` で読むので、ファイルを直接開く（`file://`）と動かない。静的サーバーで配る。

```sh
cd shuvaltzsta-un-empty
python3 -m http.server 8000
# → http://localhost:8000/
```

ビルドは不要。GitHub Pages などの静的ホスティングにこのフォルダをそのまま置けば公開できる。

## 操作

画面下のボタン（クリック・タップ）かキーボード。

| ボタン | キーボード | 探索 | 戦闘 |
| --- | --- | --- | --- |
| 十字 | 矢印 / WASD | 移動（上＝北東・右＝南東・下＝南西・左＝北西） | 移動（同じ） |
| A | X / K / Space | 話す・会話を送る | 隣の敵を攻撃 |
| B | Z / J | 会話を送る | 回避 |
| PAUSE | P / Esc | ポーズ | ポーズ |
| START | Enter | ポーズ | ポーズ／結果を閉じる |

### 戦闘のルール

- 8×8マスの戦場を十字キーで自由に歩ける。歩くのに拍は関係ない。
- **A**：隣（斜めを含む8マス）にいる敵を攻撃する。拍ぴったりで押すとダメージとコンボ。拍から外れるとミス、隣に敵がいなければ「とどかない」。
- **B**：回避。敵の攻撃は数拍前に**床の赤いマス**で予告され、拍が近づくほど濃くなる。赤いマスに立ったまま、その拍で B を押すと避けられてコンボが伸びる。
- 赤いマスの外へ歩いて逃げても当たらない。ただしコンボは増えない。
- 枠だけの赤いマスはフェイント。B を押すと空振りになり、コンボが切れる。
- 敵の頭上に `CHANCE` が出ている間は、その敵へのダメージが2倍。`GUARD` の間は弾かれる。
- 1拍につき1アクション（A か B）。
- 下の帯は拍の目安。敵の攻撃が右から流れてきて、左端の線に重なった瞬間が拍。自分が範囲に入っている攻撃は大きく赤く表示される。少し明るい部分は「確定済み区間」（憲法⑮）で、ここに入った行動はもう変わらない。
- 敵は距離と立ち回りを見て行動を変える。遠ければ近づき、回避ばかりならフェイント、攻撃ばかりならカウンターが増える（憲法⑤⑥）。

## 構成

```
index.html            ゲーム機風の外枠（画面・十字・A・B・PAUSE・START）
css/console.css       外枠のレイアウト。横持ちでは操作部が画面の左右に回る
src/
  main.js             起動
  Game.js             State の切り替えと場面のつなぎ（遭遇 → 会話 → 戦闘 → 戦闘後）
  core/
    AudioClock.js     AudioContext。時間の唯一の基準（憲法⑫）。ポーズは suspend で止める
    BeatManager.js    Beat ↔ 時刻の変換はここだけ（設計案 6）
    StateMachine.js   update されるのは常に一番上の1つ（憲法①）
    Input.js          キー・クリック・タップを、押した瞬間の AudioContext 時刻つきで積む
    Bgm.js            曲の再生・ループ・アウトロ。曲が無ければクリック音で代用
    Sfx.js            8ビット風の効果音（オシレーター）
    Assets.js         ドット絵の読み込みと色替え。画像が無ければ仮の絵を描く
    Data.js           JSON の読み込み
    draw.js           文字・枠・等角グリッドの描画
    grid.js           十字ボタンと等角グリッドの対応、距離、向き
  battle/
    EventTrack.js     「何拍目に何が起きるか」の台帳。確定済み区間への書き込みを拒む（憲法⑭⑮）
    Sequencer.js      Beat を超えたイベントを発火するだけ。補充の条件式はここ（設計案 4）
    Enemy.js          ルールベースの敵AI（設計案 9-1 の案A）。距離と戦闘傾向で Pattern を選ぶ
    areas.js          攻撃範囲の形（front1 / front3 / line3 / around）
    PlayerProfile.js  直近の行動の記録。割合は参照のたびに数える（設計案 7）
    Judge.js          判定ウィンドウ（ms）
  states/             TITLE / FIELD / DIALOG / RHYTHM_BATTLE / MENU
data/
  gameConfig.json     ゲーム性に関わる定数はすべてここ（憲法⑯）
  sprites.json        ドット絵の大きさ・足元の位置・ファイル
  enemies/*.json      敵（HP・Pattern の一覧・見た目・立ち位置）
  patterns/*.json     敵の行動部品（数拍ぶんのイベント列）
  maps/*.json         探索マップ（# が床）と遭遇
  dialogs/*.json      会話
assets/
  img/                ドット絵チップ（1ドット＝1px。表示時はぼかさずに拡大）
  bgm/battle.mp3      戦闘曲
art/reference/        ドット絵の元にした参考画像
tools/extract_sprites.py  参考画像 → チップ の変換
```

## 戦闘の流れ

```
Pattern (JSON) ──敵AIが選ぶ──▶ EventTrack ──Sequencer が読む──▶ 挙動
```

1. 戦闘開始時に曲を予約し、その時刻を Beat 0 にする。
2. 毎フレーム、`AudioContext.currentTime` から現在 Beat を出す（出力遅延ぶん後ろへずらす）。
3. `Sequencer` が確定済み区間（現在 + `lookaheadBeats`）を進め、区間に入ったイベントは `prepare`（音の予約）、Beat を超えたものは `fire`（演出と判定の受付）。
4. 敵のイベント列の末尾が `現在 + lookaheadBeats + refillMarginBeats` より手前に来たら、敵AIが次の Pattern を選んで確定済み区間の先に足す。
5. `enemy.move` の移動先と、`enemy.attack` / `enemy.feint` の攻撃範囲は、確定済み区間に入った瞬間（`prepare`）に、その時のプレイヤーの位置から決める。以後は変えないので、予告されたマスがあとからずれることはない。
6. 入力は押した時刻でイベントと突き合わせる。拍の瞬間に攻撃範囲の中にいて、判定ウィンドウのうちに避けも逃げもしなかったら被弾。
7. どちらかの HP が 0 になったら、確定済み区間の先の小節頭に `bgm.outro` と `system.finish` を載せる。曲はその小節頭でアウトロへ切り替わる。

EventTrack は `enemy` と `system`（`system.*` と `bgm.*`）の2本。`fx.*` は Pattern に混ぜてよく、ゲーム性には影響しない。

## BGM

`data/gameConfig.json` の `bgm.battle`：

| キー | 値 | 意味 |
| --- | --- | --- |
| `startBar` | 1 | 戦闘開始時にここから鳴らす。1〜8小節目は READY までの前奏 |
| `loopFromBar` | 9 | ループの始まり（9小節目の頭＝9.142秒） |
| `loopToBar` | 25 | ループの終わり（25小節目の頭＝27.428秒）。16小節ぶん |
| `outroFromBar` | 25 | 決着後はここから最後まで流す（27.428秒〜） |
| `offsetMs` | 23 | MP3 の先頭に入る無音（エンコーダ遅延）の補正 |

どれも「n小節目の頭」で数える。210BPM・4/4 なので1小節＝8/7秒。秒への換算は `Bgm.js` だけが行う。

`startBar` を 9 にすると前奏を飛ばしてすぐ戦闘になる。`offsetMs` は Chromium でデコードした結果から決めた値で、ほかのブラウザでも数ms以内に収まるはず。

## 足し方

- **敵の行動を増やす**：`data/patterns/` に JSON を足し、敵の `patterns` に id を書く。`tags` の `approach` は3マス以上離れているとき、`basic` は通常、`feint` は回避が多い相手、`counter` は攻撃が多い相手、`rush` は2マス離れているときや敵の HP が少ないときに選ばれやすい。攻撃の範囲は `payload.area` に `front1`（正面1マス）/ `front3`（正面の横3マス）/ `line3`（正面へ3マス）/ `around`（周囲8マス）で書く。
- **敵を増やす**：`data/enemies/` に JSON を足し、マップの `encounters` から呼ぶ。見た目は `sprite` と `palette`（色の置き換え表）で決まる。
- **調整する**：テンポ・判定幅・ダメージ・先読み拍数・戦場の広さ・歩く速さは `data/gameConfig.json`。
- **ドット絵を差し替える**：`art/reference/` の画像を差し替えて `python3 tools/extract_sprites.py`（要 Pillow）。画像が無い間は仮の絵で動く。

ブラウザのコンソールで `game` を見ると、今の State・EventTrack・敵AIの選択履歴を覗ける。

## まだ無いもの

- 初回起動時のリズム調整（プロットの「初回起動時は強制的にリズム調整開始」）。いまは `audioOffsetMs` を手で変える。
- TOWN / DUNGEON / SHOP の各 State、お金と体力、セーブ。負けるとマップの開始地点に戻る仮仕様。
- チャック・ジッパー・イプティムのドット絵。敵は主人公のチップを色替えした仮の姿。
- 会話の本文。いまのセリフはすべて仮。
- 敵AIのルール表（設計案 9-1 の案B）。敵が3体を超えたら移す。
