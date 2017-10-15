module.exports = function (config) {
  return {
    button: [
      {
        name: '个人中心',
        sub_button: [
          {
            type: 'view',
            name: '账户',
            url: config.site + '/#/account'
          },
          {
            type: 'click',
            name: '查票',
            key: 'FIND_TICKET'
          },
          {
            type: 'click',
            name: '抢啥',
            key: 'FIND_ACTIVITY'
          }
        ],
      },
      {
        type: 'click',
        name: '抢票',
        key: 'BUY_TICKET'
      }
    ]
  };
};
