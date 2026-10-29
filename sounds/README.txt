sounds フォルダ(任意)
=====================
標準では、効果音もBGMもプログラムでその場で生成するオリジナル音です(ファイル不要)。
好きな音源ファイルに差し替えたいときは、このフォルダに置いて、audio.js の先頭にある
SOUND_FILES にファイル名を書いてください。書かなかった音は、これまでどおり生成音が鳴ります。

差し替え可能な名前:
  bgm(ループ再生) / move / rotate / drop(即落下) / land(着地) / start / pause / clear / fail
  chain1 〜 chain7 (n連鎖目の音。8連鎖以降は chain7 を再利用)

例) const SOUND_FILES = { bgm: 'sounds/bgm.mp3', clear: 'sounds/clear.wav' };

※ 使う音源は、利用規約・ライセンス(商用可否、クレジット表記、再配布の可否など)を必ず確認してください。
