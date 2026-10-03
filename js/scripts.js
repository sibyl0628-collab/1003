/*
 * 對話腳本（純資料）。想修改諮商師說的話、選項、小建議，只要改這個檔案。
 *
 * 結構說明：
 *   TOPICS 是主題陣列，每個主題有 nodes（對話節點），從 start 指定的節點開始。
 *   節點欄位：
 *     say      諮商師說的話（陣列，一個項目一個氣泡）
 *     slot     這題的回答要歸到摘要的哪一欄：situation / feeling / thought / need
 *     choices  選項陣列，用 C(文字, 下一個節點, 選項) 建立；沒有 choices 就是純文字輸入題
 *     next     使用者自己打字時，要前往的節點
 *     end      true 代表對話結束，進入摘要頁
 *   選項欄位：tip（會收進「小步驟」）、reply（點選後諮商師額外回一句）、crisis（點選後跳出求助資訊）
 */

const C = (label, next, extra) => Object.assign({ label, next }, extra);

const TOPICS = [
  {
    id: 'stress',
    title: '壓力與焦慮',
    desc: '工作、課業或生活的壓力讓你喘不過氣、睡不好、心很緊。',
    icon: 'images/icon-stress.svg',
    start: 'start',
    nodes: {
      start: {
        say: ['嗨，謝謝你願意來。我們慢慢來，不用急，也沒有標準答案。', '先問你：最近壓力主要來自哪一塊？'],
        slot: 'situation',
        next: 'body',
        choices: [
          C('工作或課業', 'body'),
          C('家人或感情', 'body'),
          C('金錢或未來', 'body'),
          C('說不上來，就是整個人很緊', 'body', { reply: '說不上來也沒關係，身體常常比腦袋更早知道。' })
        ]
      },
      body: {
        say: ['壓力常常會先出現在身體上。最近哪一種比較明顯？'],
        slot: 'feeling',
        next: 'thought',
        choices: [
          C('睡不好', 'thought', { tip: '睡前 1 小時放下手機，把明天要做的事寫在紙上，讓腦袋可以下班。' }),
          C('胸悶、心跳很快', 'thought', { tip: '試試 4-6 呼吸：吸氣 4 秒、吐氣 6 秒，連做 5 輪。' }),
          C('一直胡思亂想', 'thought', { tip: '把腦中的念頭寫下來，再分成「我能控制」和「我不能控制」兩欄。' }),
          C('很累、沒力氣', 'thought', { tip: '今天只挑一件最小的事完成，其他的先放著，不算偷懶。' })
        ]
      },
      thought: {
        say: ['謝謝你告訴我。如果只用一兩句話說，現在最讓你放不下的是什麼？'],
        slot: 'thought',
        next: 'control'
      },
      control: {
        say: ['這件事裡，有沒有哪一部分是你現在可以做點什麼的？'],
        slot: 'need',
        next: 'step',
        choices: [
          C('有，只是不知道從哪開始', 'step', { tip: '把這件事拆成 3 個最小步驟，今天只做第一步。' }),
          C('好像都不在我手上', 'step', {
            tip: '先放下「不能控制」的部分，把力氣留給照顧自己的反應。',
            reply: '這種無力感很真實。那我們先不解決事情，只先照顧你自己。'
          }),
          C('還不確定', 'step')
        ]
      },
      step: {
        say: ['如果只做一件很小的事，讓自己好過一點點，你比較願意試哪一個？'],
        slot: 'need',
        next: 'end',
        choices: [
          C('讓自己休息一下', 'end', { tip: '設一個 15 分鐘的計時器，這段時間什麼都不用做。' }),
          C('找信任的人聊聊', 'end', { tip: '挑一個你信任的人，只說一句：「我最近有點撐不住。」' }),
          C('把事情拆小', 'end'),
          C('做點讓自己放鬆的事', 'end', { tip: '散步、洗熱水澡、聽一首喜歡的歌，選一個今天就做。' })
        ]
      },
      end: {
        say: ['你今天願意停下來整理自己，這本身就很不容易。', '我把我們聊的內容整理好了，一起看看吧。'],
        end: true
      }
    }
  },

  {
    id: 'relationship',
    title: '人際與親密關係',
    desc: '和家人、伴侶、朋友或同事之間的摩擦、誤會與距離。',
    icon: 'images/icon-relationship.svg',
    start: 'start',
    nodes: {
      start: {
        say: ['嗨，謝謝你來。關係裡的事常常很複雜，我們一步一步看。', '這次想聊的是哪一種關係？'],
        slot: 'situation',
        next: 'event',
        choices: [
          C('家人', 'event'),
          C('伴侶或曖昧對象', 'event'),
          C('朋友', 'event'),
          C('同事或主管', 'event')
        ]
      },
      event: {
        say: ['最近發生了什麼，讓你特別在意？簡單說就好，不用說得很完整。'],
        slot: 'thought',
        next: 'feel'
      },
      feel: {
        say: ['在那個當下，你的心情比較像哪一種？'],
        slot: 'feeling',
        next: 'need',
        choices: [
          C('生氣', 'need', { reply: '生氣常常是在提醒我們：有些在乎的東西被碰到了。' }),
          C('受傷、難過', 'need'),
          C('委屈，覺得不被理解', 'need'),
          C('麻木，只想逃開', 'need', { tip: '想逃不代表你冷漠，也許是你需要先喘口氣再回來面對。' })
        ]
      },
      need: {
        say: ['在這件事裡，你心裡最希望對方怎麼做？'],
        slot: 'need',
        next: 'act',
        choices: [
          C('好好聽我說、理解我', 'act'),
          C('尊重我的界線和空間', 'act', { tip: '練習清楚說出界線：「這件事我需要自己想一想，晚點再談。」' }),
          C('承認他做得不對、跟我道歉', 'act'),
          C('其實我只是想靜一靜', 'act')
        ]
      },
      act: {
        say: ['接下來，你比較傾向怎麼做？'],
        slot: 'need',
        next: 'end',
        choices: [
          C('找機會把感受說出來', 'end', { tip: '試試這個句型：「我感覺…，因為…，我希望…」，只說自己的感受，不指責對方。' }),
          C('先讓自己冷靜一下', 'end', { tip: '給自己一個期限，例如明天晚上再決定要不要談，避免在情緒高點下結論。' }),
          C('我還不確定這段關係要不要維持', 'end', { tip: '寫下這段關係「讓我充電」和「讓我耗電」的事各 3 件，看看整體的感覺。' })
        ]
      },
      end: {
        say: ['謝謝你把這些說出來。關係裡的感受被看見，本身就是一種釋放。', '我把重點整理好了。'],
        end: true
      }
    }
  },

  {
    id: 'mood',
    title: '情緒低落與自我價值',
    desc: '心情沉重、提不起勁，或常常覺得自己不夠好。',
    icon: 'images/icon-mood.svg',
    start: 'start',
    nodes: {
      start: {
        say: ['嗨，我在這裡陪你。不需要假裝很好，說真的就可以。', '最近的心情，比較像下面哪一種？'],
        slot: 'situation',
        next: 'duration',
        choices: [
          C('提不起勁，什麼都不想做', 'duration'),
          C('常常自責，覺得自己不夠好', 'duration'),
          C('莫名想哭', 'duration'),
          C('好像對什麼都沒感覺', 'duration'),
          C('有時候會想消失，或不想活了', 'duration', { crisis: true })
        ]
      },
      duration: {
        say: ['這樣的狀態，大概持續多久了？'],
        slot: 'feeling',
        next: 'voice',
        choices: [
          C('這幾天', 'voice'),
          C('好幾個星期', 'voice'),
          C('超過一個月', 'voice', {
            tip: '低落超過一個月、影響到睡眠食慾或日常，建議預約身心科或心理師做評估，這是照顧自己，不是脆弱。',
            reply: '撐了這麼久，一定很辛苦。你願意說出來，已經很了不起。'
          })
        ]
      },
      voice: {
        say: ['很多時候，心裡會有一個很嚴格的聲音。', '如果它開口，通常會對你說什麼？'],
        slot: 'thought',
        next: 'friend'
      },
      friend: {
        say: ['換個角度想：如果是你很重視的朋友，也有一模一樣的感受，你會對他說什麼？'],
        slot: 'need',
        next: 'support'
      },
      support: {
        say: ['最近有沒有什麼人或什麼事，哪怕只有一點點，讓你好過一些？'],
        slot: 'need',
        next: 'end',
        choices: [
          C('有人可以說說話', 'end', { tip: '今天主動傳一則訊息給那個人，不用談重要的事，打聲招呼就好。' }),
          C('有個小習慣或小確幸', 'end', { tip: '把那個小確幸排進今天的行程，當作一件正式的待辦事項。' }),
          C('目前真的沒有', 'end', {
            tip: '先從最基本的開始：喝水、吃一餐、曬 10 分鐘太陽。把自己當成需要被照顧的人。',
            reply: '謝謝你誠實說。沒有也沒關係，我們先從很小的地方開始。'
          })
        ]
      },
      end: {
        say: ['你剛剛對朋友說的那些溫柔的話，其實你也值得聽見。', '我把今天聊的整理好了。'],
        end: true
      }
    }
  },

  {
    id: 'direction',
    title: '決策與人生方向',
    desc: '轉職、選擇困難，或不確定自己真正想要什麼。',
    icon: 'images/icon-direction.svg',
    start: 'start',
    nodes: {
      start: {
        say: ['嗨，謝謝你來。卡在選擇的路口，其實很常見。', '你現在比較像是卡在哪裡？'],
        slot: 'situation',
        next: 'value',
        choices: [
          C('選項太多，不知道怎麼選', 'value'),
          C('不知道自己想要什麼', 'value'),
          C('想改變，但不敢踏出去', 'value'),
          C('被別人的期待綁住了', 'value')
        ]
      },
      value: {
        say: ['先不急著決定。我想了解你：下面哪一個，對你現在的人生最重要？'],
        slot: 'need',
        next: 'fear',
        choices: [
          C('穩定與安心', 'fear'),
          C('成長與挑戰', 'fear'),
          C('自由與彈性', 'fear'),
          C('被需要與有意義', 'fear')
        ]
      },
      fear: {
        say: ['如果真的做了那個選擇，你最擔心的是什麼？'],
        slot: 'thought',
        next: 'worst'
      },
      worst: {
        say: ['試著想像最壞的情況真的發生了，你覺得自己撐得過去嗎？'],
        slot: 'feeling',
        next: 'trial',
        choices: [
          C('能，只是會很辛苦', 'trial', { reply: '知道自己能撐住，是很重要的底氣。' }),
          C('不太確定', 'trial'),
          C('不太能', 'trial', { tip: '先想想有什麼可以降低風險的做法，例如存一筆緩衝金，或先保留現在的工作再試水溫。' })
        ]
      },
      trial: {
        say: ['有沒有辦法不用一次賭上全部，先用小一點的方式試試看？'],
        slot: 'need',
        next: 'end',
        choices: [
          C('有，可以先小規模嘗試', 'end', { tip: '找一位已經在做那件事的人，約 30 分鐘聊聊真實的日常。' }),
          C('好像沒辦法', 'end', { tip: '把「沒辦法」寫下來，再問自己：是真的沒辦法，還是我現在還沒想到？' }),
          C('我還沒想過', 'end', { tip: '用一週的時間，每天花 10 分鐘查資料或寫下想法，不做決定，只收集線索。' })
        ]
      },
      end: {
        say: ['方向不一定要一次想清楚，看見自己在乎什麼，就是很好的起點。', '我把重點整理好了。'],
        end: true
      }
    }
  }
];

// 對話結束時，若蒐集到的小步驟不足，補上這些通用建議
const GENERIC_TIPS = [
  '今天睡前，寫下一件「今天我做得還不錯」的小事。',
  '給自己一段不被打擾的 10 分鐘，只是安靜地呼吸。'
];

// 摘要頁各欄位的標題
const SLOT_LABELS = {
  situation: '目前的狀況',
  feeling: '我的感受',
  thought: '我在意的事',
  need: '我需要的'
};

// 求助專線（台灣）
const HOTLINES = [
  { name: '安心專線', number: '1925', note: '24 小時，心理諮詢' },
  { name: '生命線', number: '1995', note: '24 小時，情緒與危機協談' },
  { name: '張老師', number: '1980', note: '心理與情緒諮詢' },
  { name: '警察／消防救護', number: '110 / 119', note: '緊急危險時請立即撥打' }
];
