function createInitialData(uuidv4) {
  return {
    inquiryCount: 0,
    dealAmount: 0,
    latestDeal: null,
    latestInquiry: null,
    users: [],
    music: [],
    inquiryConfig: {
      addInquiryMusicId: null,
      reduceInquiryMusicId: null
    },
    defaultBattleSong: null, // 添加默认战歌配置
    startupAudio: {
      mode: 'default',
      audioPath: '/music/Go.mp3',
      ttsText: '',
      updatedAt: new Date().toISOString()
    },
    personalizedAudio: [],
    personalizedFire: null,
    // 添加目标设置
    targets: {
      inquiryTarget: 0,
      dealTarget: 0,
      resetPeriod: 'weekly',
      lastResetTime: new Date().toISOString()
    },
    // 添加默认的庆祝语数组
    celebrationMessages: [
      {
        id: uuidv4(),
        message: '轰动！{platform}刚刚被{person}攻陷！巴布之光业绩再创新高，成交{amount}元，给{person}疯狂打call！'
      },
      {
        id: uuidv4(),
        message: '震惊！平台运营{person}竟在{platform}用实力收割客户，成交额高达{amount}元！月底KPI有救了！'
      },
      {
        id: uuidv4(),
        message: '恭喜恭喜！{person}在{platform}疯狂带单{amount}元！这波操作太秀了，全公司都要请客！'
      },
      {
        id: uuidv4(),
        message: '注意注意！业务{person}刚刚搞定{platform}一大波订单，成交{amount}元！领导已经开香槟了！'
      },
      {
        id: uuidv4(),
        message: '沸腾沸腾！{person}的超级业绩诞生啦！从{platform}斩获{amount}元大单，这个月提成又是小目标！'
      },
      {
        id: uuidv4(),
        message: '重磅消息！{person}在{platform}上的运营策略大获成功！成交额突破{amount}元，真是人才啊！'
      },
      {
        id: uuidv4(),
        message: '好家伙！{person}又来一单{amount}元！{platform}被我们承包了，这是要起飞的节奏！'
      },
      {
        id: uuidv4(),
        message: '天呐！{person}刚刚从{platform}拿下{amount}元订单！别人家的运营真会玩，学到了学到了！'
      }
    ],
    // 添加平台目标数据
    platformTargets: [
      {
        id: uuidv4(),
        name: '阿里巴巴',
        target: 8000000,
        current: 0,
        enabled: true
      },
      {
        id: uuidv4(),
        name: '独立站',
        target: 6000000,
        current: 0,
        enabled: true
      },
      {
        id: uuidv4(),
        name: '亚马逊',
        target: 5000000,
        current: 0,
        enabled: true
      },
      {
        id: uuidv4(),
        name: '1688',
        target: 3000000,
        current: 0,
        enabled: true
      },
      {
        id: uuidv4(),
        name: '其他平台',
        target: 2000000,
        current: 0,
        enabled: true
      }
    ]
  };
}

module.exports = {
  createInitialData
};
