// Embedded, byte-for-byte copy of data/plays.json's content, generated
// because this repo's GitHub Pages deploy does not publish the data/
// folder as a static asset (confirmed: manifest.json and js/*.js at other
// paths deploy fine, data/plays.json 404s on the live site) -- so the
// "Admin: Sync Shipped Defaults to Cloud" button in Edit Plays (see
// js/edit-plays.js) can't fetch it over the network like a normal static
// file. Loaded as a plain script instead; the button reads
// window.SHIPPED_PLAYS_JSON directly.
//
// IMPORTANT -- this file is a SNAPSHOT, not a live reference: whenever
// data/plays.json changes (a new play, a new toggle/flag, restructured
// routes), this file must be regenerated to match it byte-for-byte, or
// the Sync button will push stale data to the cloud. There is currently
// no automated step that keeps the two in sync -- until the Pages deploy
// is fixed to publish data/ (or some other automation is added), treat
// "update data/plays.json" and "regenerate js/shipped-defaults.js" as one
// inseparable step.
window.SHIPPED_PLAYS_JSON = {
  "formation": {
    "5": [
      462,
      204
    ],
    "6": [
      1149,
      204
    ],
    "LT": [
      577,
      204
    ],
    "LG": [
      692,
      204
    ],
    "C": [
      806,
      204
    ],
    "RG": [
      921,
      204
    ],
    "RT": [
      1035,
      204
    ]
  },
  "backfield": {
    "1": [
      809,
      438
    ],
    "2": [
      985,
      438
    ],
    "3": [
      638,
      438
    ]
  },
  "wing": {
    "Left": [
      360,
      269
    ],
    "Right": [
      1251,
      269
    ]
  },
  "split": {
    "Right": {
      "1": [
        809,
        438
      ],
      "2": [
        1362,
        289
      ],
      "3": [
        638,
        438
      ],
      "4": [
        185,
        269
      ],
      "5": [
        463,
        204
      ],
      "6": [
        1512,
        204
      ]
    },
    "Left": {
      "1": [
        809,
        438
      ],
      "2": [
        985,
        438
      ],
      "3": [
        248,
        269
      ],
      "4": [
        1415,
        289
      ],
      "5": [
        98,
        204
      ],
      "6": [
        1147,
        204
      ]
    }
  },
  "splitRoutes": {
    "Right": {
      "wide": {
        "player": 6,
        "seattle": [
          [
            1512,
            204
          ],
          [
            1515,
            60
          ],
          [
            1252,
            -61
          ]
        ],
        "houston": [
          [
            1512,
            204
          ],
          [
            1518,
            -206
          ]
        ],
        "florida": [
          [
            1512,
            204
          ],
          [
            1352,
            338
          ],
          [
            1195,
            236
          ]
        ],
        "boston": [
          [
            1512,
            204
          ],
          [
            1314,
            94
          ],
          [
            1496,
            85
          ]
        ]
      },
      "flex": {
        "player": 2,
        "seattle": [
          [
            1362,
            289
          ],
          [
            1523,
            108
          ],
          [
            1580,
            139
          ]
        ],
        "houston": [
          [
            1362,
            289
          ],
          [
            1362,
            119
          ],
          [
            1318,
            103
          ]
        ],
        "florida": [
          [
            1362,
            289
          ],
          [
            1370,
            -118
          ]
        ],
        "boston": [
          [
            1362,
            289
          ],
          [
            1128,
            137
          ]
        ]
      }
    },
    "Left": {
      "wide": {
        "player": 5,
        "seattle": [
          [
            98,
            204
          ],
          [
            94,
            45
          ],
          [
            352,
            -60
          ]
        ],
        "houston": [
          [
            98,
            204
          ],
          [
            94,
            -204
          ]
        ],
        "florida": [
          [
            98,
            204
          ],
          [
            418,
            237
          ],
          [
            259,
            -145
          ]
        ],
        "boston": [
          [
            98,
            204
          ],
          [
            296,
            94
          ],
          [
            114,
            85
          ]
        ]
      },
      "flex": {
        "player": 3,
        "seattle": [
          [
            248,
            269
          ],
          [
            88,
            122
          ],
          [
            20,
            122
          ]
        ],
        "houston": [
          [
            248,
            269
          ],
          [
            248,
            95
          ],
          [
            304,
            75
          ]
        ],
        "florida": [
          [
            248,
            269
          ],
          [
            243,
            -138
          ]
        ],
        "boston": [
          [
            248,
            269
          ],
          [
            482,
            117
          ]
        ]
      }
    }
  },
  "viewBox": [
    1600,
    1030
  ],
  "topPad": 400,
  "playTypes": [
    {
      "key": "inside_zone",
      "label": "Inside Zone",
      "hasReadToggle": true,
      "directions": {
        "Left": {
          "A": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DT_L",
            "paths": [
              {
                "player": 2,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    856.8,
                    320
                  ],
                  [
                    749,
                    245
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1011,
                    400
                  ],
                  [
                    1161,
                    280
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "B": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  749,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DT_L",
            "paths": [
              {
                "player": 2,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    805.275,
                    320
                  ],
                  [
                    634.5,
                    255
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1011,
                    400
                  ],
                  [
                    1161,
                    280
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    445,
                    143
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    485,
                    143
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    672,
                    143
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    939,
                    143
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1171,
                    143
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  749,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        },
        "Right": {
          "A": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DT_R",
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    600,
                    400
                  ],
                  [
                    450,
                    280
                  ]
                ]
              },
              {
                "player": 3,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    754.2,
                    320
                  ],
                  [
                    862,
                    245
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "B": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  864,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DT_R",
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    600,
                    400
                  ],
                  [
                    450,
                    280
                  ]
                ]
              },
              {
                "player": 3,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    805.725,
                    320
                  ],
                  [
                    976.5,
                    255
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    445,
                    143
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    485,
                    143
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    672,
                    143
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    939,
                    143
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1171,
                    143
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  864,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        }
      }
    },
    {
      "key": "outside_zone",
      "label": "Outside Zone",
      "hasCounter": true,
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "Normal": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DE_L",
            "paths": [
              {
                "player": 2,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    830,
                    320
                  ],
                  [
                    487,
                    290
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1000,
                    400
                  ],
                  [
                    1145,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Counter": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DE_L",
            "paths": [
              {
                "player": 2,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    830,
                    320
                  ],
                  [
                    487,
                    290
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1000,
                    400
                  ],
                  [
                    1145,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    360,
                    269
                  ],
                  [
                    520,
                    340
                  ],
                  [
                    700,
                    309
                  ],
                  [
                    900,
                    220
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        },
        "Right": {
          "Normal": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DE_R",
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    611,
                    400
                  ],
                  [
                    466,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    781,
                    320
                  ],
                  [
                    1124,
                    290
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Counter": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": "DE_R",
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    611,
                    400
                  ],
                  [
                    466,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    781,
                    320
                  ],
                  [
                    1124,
                    290
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1251,
                    269
                  ],
                  [
                    1091,
                    340
                  ],
                  [
                    911,
                    309
                  ],
                  [
                    711,
                    220
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        }
      }
    },
    {
      "key": "option",
      "label": "Option",
      "hasCounter": true,
      "noBoot": true,
      "directionFixed": true,
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "Normal": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    611,
                    400
                  ],
                  [
                    466,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    781,
                    320
                  ],
                  [
                    862,
                    245
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 4,
                "optionLine": true,
                "points": [
                  [
                    557.14,
                    342.17
                  ],
                  [
                    529.4799999999999,
                    447.92
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "dualSideBlock": true,
                "sameSidePoints": [
                  [
                    462,
                    204
                  ],
                  [
                    586.2,
                    2.4
                  ]
                ],
                "crossPoints": [
                  [
                    462,
                    204
                  ],
                  [
                    181.2,
                    101.4
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    496.2,
                    2.4
                  ]
                ],
                "crossPoints4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    181.2,
                    101.4
                  ]
                ],
                "crossNote": "Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Counter": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    851,
                    545
                  ],
                  [
                    341,
                    400
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    611,
                    400
                  ],
                  [
                    466,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    666,
                    415
                  ],
                  [
                    781,
                    320
                  ],
                  [
                    862,
                    245
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 4,
                "optionLine": true,
                "points": [
                  [
                    557.14,
                    342.17
                  ],
                  [
                    529.4799999999999,
                    447.92
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "dualSideBlock": true,
                "sameSidePoints": [
                  [
                    462,
                    204
                  ],
                  [
                    586.2,
                    2.4
                  ]
                ],
                "crossPoints": [
                  [
                    462,
                    204
                  ],
                  [
                    181.2,
                    101.4
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    496.2,
                    2.4
                  ]
                ],
                "crossPoints4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    181.2,
                    101.4
                  ]
                ],
                "crossNote": "Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    360,
                    269
                  ],
                  [
                    480,
                    360
                  ],
                  [
                    520,
                    322
                  ],
                  [
                    650,
                    230
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        },
        "Right": {
          "Normal": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    830,
                    320
                  ],
                  [
                    749,
                    245
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1000,
                    400
                  ],
                  [
                    1145,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 4,
                "optionLine": true,
                "points": [
                  [
                    1053.8600000000001,
                    342.17
                  ],
                  [
                    1081.5200000000002,
                    447.92
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "dualSideBlock": true,
                "sameSidePoints": [
                  [
                    1149,
                    204
                  ],
                  [
                    1023.9,
                    2.4
                  ]
                ],
                "crossPoints": [
                  [
                    1149,
                    204
                  ],
                  [
                    1428.9,
                    101.4
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1104.9,
                    2.4
                  ]
                ],
                "crossPoints4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1428.9,
                    101.4
                  ]
                ],
                "crossNote": "Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Counter": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    945,
                    415
                  ],
                  [
                    830,
                    320
                  ],
                  [
                    749,
                    245
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    1000,
                    400
                  ],
                  [
                    1145,
                    275
                  ]
                ]
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    760,
                    545
                  ],
                  [
                    1270,
                    400
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 4,
                "optionLine": true,
                "points": [
                  [
                    1053.8600000000001,
                    342.17
                  ],
                  [
                    1081.5200000000002,
                    447.92
                  ]
                ]
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "dualSideBlock": true,
                "sameSidePoints": [
                  [
                    1149,
                    204
                  ],
                  [
                    1023.9,
                    2.4
                  ]
                ],
                "crossPoints": [
                  [
                    1149,
                    204
                  ],
                  [
                    1428.9,
                    101.4
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1104.9,
                    2.4
                  ]
                ],
                "crossPoints4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1428.9,
                    101.4
                  ]
                ],
                "crossNote": "Reads the LB stacked behind the DE -- blocks him if he's there, otherwise works out to the CB"
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1251,
                    269
                  ],
                  [
                    1131,
                    360
                  ],
                  [
                    1091,
                    322
                  ],
                  [
                    961,
                    230
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        }
      }
    },
    {
      "key": "blast",
      "label": "Blast",
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "Outside": {
            "Normal": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1010,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      638,
                      438
                    ],
                    [
                      638,
                      200
                    ],
                    [
                      619,
                      70
                    ],
                    [
                      600,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 2,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      985,
                      438
                    ],
                    [
                      793,
                      355
                    ],
                    [
                      634.5,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      809,
                      438
                    ],
                    [
                      1010,
                      400
                    ],
                    [
                      1160,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            },
            "Counter": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1010,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      638,
                      438
                    ],
                    [
                      638,
                      200
                    ],
                    [
                      619,
                      70
                    ],
                    [
                      600,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      985,
                      438
                    ],
                    [
                      793,
                      355
                    ],
                    [
                      634.5,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      809,
                      438
                    ],
                    [
                      1010,
                      400
                    ],
                    [
                      1160,
                      280
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      724,
                      438
                    ],
                    [
                      634.5,
                      155
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            }
          },
          "Inside": {
            "Normal": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1010,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      638,
                      438
                    ],
                    [
                      638,
                      200
                    ],
                    [
                      619,
                      70
                    ],
                    [
                      600,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 2,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      985,
                      438
                    ],
                    [
                      793,
                      355
                    ],
                    [
                      703.1,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      809,
                      438
                    ],
                    [
                      1010,
                      400
                    ],
                    [
                      1160,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            },
            "Counter": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1010,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      638,
                      438
                    ],
                    [
                      638,
                      200
                    ],
                    [
                      619,
                      70
                    ],
                    [
                      600,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      985,
                      438
                    ],
                    [
                      793,
                      355
                    ],
                    [
                      703.1,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      809,
                      438
                    ],
                    [
                      1010,
                      400
                    ],
                    [
                      1160,
                      280
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      724,
                      438
                    ],
                    [
                      703.1,
                      155
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            }
          }
        },
        "Right": {
          "Outside": {
            "Normal": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1011,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      973,
                      438
                    ],
                    [
                      973,
                      200
                    ],
                    [
                      992,
                      70
                    ],
                    [
                      1011,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 3,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      626,
                      438
                    ],
                    [
                      818,
                      355
                    ],
                    [
                      976.5,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      802,
                      438
                    ],
                    [
                      601,
                      400
                    ],
                    [
                      451,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            },
            "Counter": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1011,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      973,
                      438
                    ],
                    [
                      973,
                      200
                    ],
                    [
                      992,
                      70
                    ],
                    [
                      1011,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      626,
                      438
                    ],
                    [
                      818,
                      355
                    ],
                    [
                      976.5,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      802,
                      438
                    ],
                    [
                      601,
                      400
                    ],
                    [
                      451,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      888,
                      438
                    ],
                    [
                      976.5,
                      155
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            }
          },
          "Inside": {
            "Normal": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1011,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      973,
                      438
                    ],
                    [
                      973,
                      200
                    ],
                    [
                      992,
                      70
                    ],
                    [
                      1011,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 3,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      626,
                      438
                    ],
                    [
                      818,
                      355
                    ],
                    [
                      908.3,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      802,
                      438
                    ],
                    [
                      601,
                      400
                    ],
                    [
                      451,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1149,
                      204
                    ],
                    [
                      1179.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            },
            "Counter": {
              "defense": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    600,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_L",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -20
                  ],
                  "label": "LB",
                  "id": "MLB",
                  "extra": true
                },
                {
                  "pos": [
                    1011,
                    -20
                  ],
                  "label": "LB",
                  "id": "OLB_R",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    650,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                },
                {
                  "pos": [
                    960,
                    -190
                  ],
                  "label": "S",
                  "id": "SS",
                  "extra": true
                }
              ],
              "readKeyId": null,
              "paths": [
                {
                  "player": 2,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      973,
                      438
                    ],
                    [
                      973,
                      200
                    ],
                    [
                      992,
                      70
                    ],
                    [
                      1011,
                      -20
                    ]
                  ],
                  "lineThenCurve": true
                },
                {
                  "player": 3,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      626,
                      438
                    ],
                    [
                      818,
                      355
                    ],
                    [
                      908.3,
                      155
                    ]
                  ]
                },
                {
                  "player": 1,
                  "ball": false,
                  "width": 9,
                  "points": [
                    [
                      802,
                      438
                    ],
                    [
                      601,
                      400
                    ],
                    [
                      451,
                      280
                    ]
                  ]
                },
                {
                  "player": 5,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ],
                  "isBlocking": true,
                  "points4x4": [
                    [
                      462,
                      204
                    ],
                    [
                      438.6,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      577,
                      204
                    ],
                    [
                      450.1,
                      119.39999999999999
                    ]
                  ],
                  "id": "LT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      577,
                      204
                    ],
                    [
                      507.7,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ],
                  "id": "LG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      692,
                      204
                    ],
                    [
                      665,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      806,
                      204
                    ],
                    [
                      806,
                      144
                    ]
                  ],
                  "id": "C",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      806,
                      204
                    ],
                    [
                      890.6,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ],
                  "id": "RG",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      921,
                      204
                    ],
                    [
                      946.2,
                      119.39999999999999
                    ]
                  ]
                },
                {
                  "player": null,
                  "ball": false,
                  "width": 7,
                  "points": [
                    [
                      1035,
                      204
                    ],
                    [
                      1131,
                      143
                    ]
                  ],
                  "id": "RT",
                  "isBlocking": true,
                  "points4x4": [
                    [
                      1035,
                      204
                    ],
                    [
                      1093.5,
                      2.4000000000000057
                    ]
                  ]
                },
                {
                  "player": 4,
                  "ball": false,
                  "width": 7,
                  "blockRelative": true,
                  "isBlocking": true,
                  "sameSidePoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "crossPoints": [
                    [
                      0,
                      0
                    ],
                    [
                      156,
                      -188
                    ]
                  ],
                  "sameSidePoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ],
                  "crossPoints4x4": [
                    [
                      0,
                      0
                    ],
                    [
                      135.8499999999999,
                      -116.35000000000002
                    ]
                  ]
                },
                {
                  "player": 6,
                  "ball": true,
                  "width": 9,
                  "points": [
                    [
                      1149,
                      204
                    ],
                    [
                      888,
                      438
                    ],
                    [
                      908.3,
                      155
                    ]
                  ]
                }
              ],
              "defense4x4": [
                {
                  "pos": [
                    436,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_L"
                },
                {
                  "pos": [
                    662,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_L"
                },
                {
                  "pos": [
                    949,
                    110
                  ],
                  "label": "DT",
                  "id": "DT_R"
                },
                {
                  "pos": [
                    1183,
                    110
                  ],
                  "label": "DE",
                  "id": "DE_R"
                },
                {
                  "pos": [
                    500,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB1",
                  "extra": true
                },
                {
                  "pos": [
                    700,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB2",
                  "extra": true
                },
                {
                  "pos": [
                    900,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB3",
                  "extra": true
                },
                {
                  "pos": [
                    1100,
                    -20
                  ],
                  "label": "LB",
                  "id": "LB4",
                  "extra": true
                },
                {
                  "pos": [
                    150,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_L",
                  "extra": true
                },
                {
                  "pos": [
                    1460,
                    90
                  ],
                  "label": "CB",
                  "id": "CB_R",
                  "extra": true
                },
                {
                  "pos": [
                    805,
                    -190
                  ],
                  "label": "S",
                  "id": "FS",
                  "extra": true
                }
              ]
            }
          }
        }
      },
      "hasInsideOutside": true,
      "hasCounter": true,
      "counterAwayFromWing": true
    },
    {
      "key": "double_blast",
      "label": "Double Blast",
      "noBoot": true,
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "Outside": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    638,
                    200
                  ],
                  [
                    619,
                    70
                  ],
                  [
                    600,
                    -20
                  ]
                ],
                "lineThenCurve": true
              },
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    985,
                    438
                  ],
                  [
                    793,
                    355
                  ],
                  [
                    634.5,
                    155
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    718,
                    350
                  ],
                  [
                    634.5,
                    180
                  ]
                ],
                "delayMs": 500
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Inside": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1010,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    638,
                    438
                  ],
                  [
                    638,
                    200
                  ],
                  [
                    619,
                    70
                  ],
                  [
                    600,
                    -20
                  ]
                ],
                "lineThenCurve": true
              },
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    985,
                    438
                  ],
                  [
                    793,
                    355
                  ],
                  [
                    634.5,
                    155
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    809,
                    438
                  ],
                  [
                    718,
                    350
                  ],
                  [
                    703.1,
                    180
                  ]
                ],
                "delayMs": 500
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        },
        "Right": {
          "Outside": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1011,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    973,
                    200
                  ],
                  [
                    992,
                    70
                  ],
                  [
                    1011,
                    -20
                  ]
                ],
                "lineThenCurve": true
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    626,
                    438
                  ],
                  [
                    818,
                    355
                  ],
                  [
                    976.5,
                    155
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    893,
                    350
                  ],
                  [
                    976.5,
                    180
                  ]
                ],
                "delayMs": 500
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          },
          "Inside": {
            "defense": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  600,
                  -20
                ],
                "label": "LB",
                "id": "OLB_L",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -20
                ],
                "label": "LB",
                "id": "MLB",
                "extra": true
              },
              {
                "pos": [
                  1011,
                  -20
                ],
                "label": "LB",
                "id": "OLB_R",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  650,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              },
              {
                "pos": [
                  960,
                  -190
                ],
                "label": "S",
                "id": "SS",
                "extra": true
              }
            ],
            "readKeyId": null,
            "paths": [
              {
                "player": 2,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    973,
                    438
                  ],
                  [
                    973,
                    200
                  ],
                  [
                    992,
                    70
                  ],
                  [
                    1011,
                    -20
                  ]
                ],
                "lineThenCurve": true
              },
              {
                "player": 3,
                "ball": false,
                "width": 9,
                "points": [
                  [
                    626,
                    438
                  ],
                  [
                    818,
                    355
                  ],
                  [
                    976.5,
                    155
                  ]
                ]
              },
              {
                "player": 1,
                "ball": true,
                "width": 9,
                "points": [
                  [
                    802,
                    438
                  ],
                  [
                    893,
                    350
                  ],
                  [
                    908.3,
                    180
                  ]
                ],
                "delayMs": 500
              },
              {
                "player": 5,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    462,
                    204
                  ],
                  [
                    438.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    577,
                    204
                  ],
                  [
                    450.1,
                    119.39999999999999
                  ]
                ],
                "id": "LT",
                "isBlocking": true,
                "points4x4": [
                  [
                    577,
                    204
                  ],
                  [
                    507.7,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ],
                "id": "LG",
                "isBlocking": true,
                "points4x4": [
                  [
                    692,
                    204
                  ],
                  [
                    665,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    806,
                    204
                  ],
                  [
                    806,
                    144
                  ]
                ],
                "id": "C",
                "isBlocking": true,
                "points4x4": [
                  [
                    806,
                    204
                  ],
                  [
                    890.6,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ],
                "id": "RG",
                "isBlocking": true,
                "points4x4": [
                  [
                    921,
                    204
                  ],
                  [
                    946.2,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": null,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1035,
                    204
                  ],
                  [
                    1131,
                    143
                  ]
                ],
                "id": "RT",
                "isBlocking": true,
                "points4x4": [
                  [
                    1035,
                    204
                  ],
                  [
                    1093.5,
                    2.4000000000000057
                  ]
                ]
              },
              {
                "player": 6,
                "ball": false,
                "width": 7,
                "points": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ],
                "isBlocking": true,
                "points4x4": [
                  [
                    1149,
                    204
                  ],
                  [
                    1179.6,
                    119.39999999999999
                  ]
                ]
              },
              {
                "player": 4,
                "ball": false,
                "width": 7,
                "blockRelative": true,
                "isBlocking": true,
                "sameSidePoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "crossPoints": [
                  [
                    0,
                    0
                  ],
                  [
                    156,
                    -188
                  ]
                ],
                "sameSidePoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ],
                "crossPoints4x4": [
                  [
                    0,
                    0
                  ],
                  [
                    135.8499999999999,
                    -116.35000000000002
                  ]
                ]
              }
            ],
            "defense4x4": [
              {
                "pos": [
                  436,
                  110
                ],
                "label": "DE",
                "id": "DE_L"
              },
              {
                "pos": [
                  662,
                  110
                ],
                "label": "DT",
                "id": "DT_L"
              },
              {
                "pos": [
                  949,
                  110
                ],
                "label": "DT",
                "id": "DT_R"
              },
              {
                "pos": [
                  1183,
                  110
                ],
                "label": "DE",
                "id": "DE_R"
              },
              {
                "pos": [
                  500,
                  -20
                ],
                "label": "LB",
                "id": "LB1",
                "extra": true
              },
              {
                "pos": [
                  700,
                  -20
                ],
                "label": "LB",
                "id": "LB2",
                "extra": true
              },
              {
                "pos": [
                  900,
                  -20
                ],
                "label": "LB",
                "id": "LB3",
                "extra": true
              },
              {
                "pos": [
                  1100,
                  -20
                ],
                "label": "LB",
                "id": "LB4",
                "extra": true
              },
              {
                "pos": [
                  150,
                  90
                ],
                "label": "CB",
                "id": "CB_L",
                "extra": true
              },
              {
                "pos": [
                  1460,
                  90
                ],
                "label": "CB",
                "id": "CB_R",
                "extra": true
              },
              {
                "pos": [
                  805,
                  -190
                ],
                "label": "S",
                "id": "FS",
                "extra": true
              }
            ]
          }
        }
      },
      "hasInsideOutside": true
    },
    {
      "key": "option_pass",
      "label": "Option Pass",
      "noBoot": true,
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "defense": [
            {
              "pos": [
                436,
                110
              ],
              "label": "DE",
              "id": "DE_L"
            },
            {
              "pos": [
                662,
                110
              ],
              "label": "DT",
              "id": "DT_L"
            },
            {
              "pos": [
                949,
                110
              ],
              "label": "DT",
              "id": "DT_R"
            },
            {
              "pos": [
                1183,
                110
              ],
              "label": "DE",
              "id": "DE_R"
            },
            {
              "pos": [
                600,
                -20
              ],
              "label": "LB",
              "id": "OLB_L",
              "extra": true
            },
            {
              "pos": [
                805,
                -20
              ],
              "label": "LB",
              "id": "MLB",
              "extra": true
            },
            {
              "pos": [
                1010,
                -20
              ],
              "label": "LB",
              "id": "OLB_R",
              "extra": true
            },
            {
              "pos": [
                150,
                90
              ],
              "label": "CB",
              "id": "CB_L",
              "extra": true
            },
            {
              "pos": [
                1460,
                90
              ],
              "label": "CB",
              "id": "CB_R",
              "extra": true
            },
            {
              "pos": [
                650,
                -190
              ],
              "label": "S",
              "id": "FS",
              "extra": true
            },
            {
              "pos": [
                960,
                -190
              ],
              "label": "S",
              "id": "SS",
              "extra": true
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "player": 2,
              "ball": false,
              "width": 9,
              "points": [
                [
                  973,
                  438
                ],
                [
                  851,
                  545
                ],
                [
                  341,
                  400
                ]
              ]
            },
            {
              "player": 1,
              "ball": true,
              "width": 9,
              "points": [
                [
                  802,
                  438
                ],
                [
                  611,
                  400
                ],
                [
                  466,
                  275
                ]
              ]
            },
            {
              "player": 3,
              "ball": false,
              "width": 9,
              "points": [
                [
                  666,
                  415
                ],
                [
                  781,
                  320
                ],
                [
                  862,
                  245
                ]
              ]
            },
            {
              "player": null,
              "ball": false,
              "width": 4,
              "optionLine": true,
              "points": [
                [
                  557.14,
                  342.17
                ],
                [
                  529.4799999999999,
                  447.92
                ]
              ]
            },
            {
              "player": 5,
              "ball": false,
              "width": 9,
              "points": [
                [
                  462,
                  204
                ],
                [
                  511,
                  90
                ],
                [
                  531,
                  30
                ],
                [
                  211,
                  -70
                ],
                [
                  91,
                  -90
                ]
              ]
            },
            {
              "player": 4,
              "ball": false,
              "width": 9,
              "points": [
                [
                  0,
                  0
                ]
              ],
              "wingSeamRelative": true,
              "sameSideOffsets": [
                [
                  0,
                  0
                ],
                [
                  -15,
                  -189
                ],
                [
                  140,
                  -409
                ],
                [
                  70,
                  -519
                ],
                [
                  -30,
                  -599
                ]
              ],
              "crossOffsets": [
                [
                  0,
                  0
                ],
                [
                  -15,
                  -209
                ],
                [
                  40,
                  -499
                ],
                [
                  390,
                  -569
                ],
                [
                  740,
                  -599
                ]
              ]
            },
            {
              "player": 6,
              "ball": false,
              "width": 9,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1081,
                  90
                ],
                [
                  1051,
                  42
                ],
                [
                  806,
                  35
                ],
                [
                  633,
                  42
                ]
              ]
            }
          ],
          "defense4x4": [
            {
              "pos": [
                436,
                110
              ],
              "label": "DE",
              "id": "DE_L"
            },
            {
              "pos": [
                662,
                110
              ],
              "label": "DT",
              "id": "DT_L"
            },
            {
              "pos": [
                949,
                110
              ],
              "label": "DT",
              "id": "DT_R"
            },
            {
              "pos": [
                1183,
                110
              ],
              "label": "DE",
              "id": "DE_R"
            },
            {
              "pos": [
                500,
                -20
              ],
              "label": "LB",
              "id": "LB1",
              "extra": true
            },
            {
              "pos": [
                700,
                -20
              ],
              "label": "LB",
              "id": "LB2",
              "extra": true
            },
            {
              "pos": [
                900,
                -20
              ],
              "label": "LB",
              "id": "LB3",
              "extra": true
            },
            {
              "pos": [
                1100,
                -20
              ],
              "label": "LB",
              "id": "LB4",
              "extra": true
            },
            {
              "pos": [
                150,
                90
              ],
              "label": "CB",
              "id": "CB_L",
              "extra": true
            },
            {
              "pos": [
                1460,
                90
              ],
              "label": "CB",
              "id": "CB_R",
              "extra": true
            },
            {
              "pos": [
                805,
                -190
              ],
              "label": "S",
              "id": "FS",
              "extra": true
            }
          ]
        },
        "Right": {
          "defense": [
            {
              "pos": [
                436,
                110
              ],
              "label": "DE",
              "id": "DE_L"
            },
            {
              "pos": [
                662,
                110
              ],
              "label": "DT",
              "id": "DT_L"
            },
            {
              "pos": [
                949,
                110
              ],
              "label": "DT",
              "id": "DT_R"
            },
            {
              "pos": [
                1183,
                110
              ],
              "label": "DE",
              "id": "DE_R"
            },
            {
              "pos": [
                600,
                -20
              ],
              "label": "LB",
              "id": "OLB_L",
              "extra": true
            },
            {
              "pos": [
                805,
                -20
              ],
              "label": "LB",
              "id": "MLB",
              "extra": true
            },
            {
              "pos": [
                1010,
                -20
              ],
              "label": "LB",
              "id": "OLB_R",
              "extra": true
            },
            {
              "pos": [
                150,
                90
              ],
              "label": "CB",
              "id": "CB_L",
              "extra": true
            },
            {
              "pos": [
                1460,
                90
              ],
              "label": "CB",
              "id": "CB_R",
              "extra": true
            },
            {
              "pos": [
                650,
                -190
              ],
              "label": "S",
              "id": "FS",
              "extra": true
            },
            {
              "pos": [
                960,
                -190
              ],
              "label": "S",
              "id": "SS",
              "extra": true
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "player": 2,
              "ball": false,
              "width": 9,
              "points": [
                [
                  945,
                  415
                ],
                [
                  830,
                  320
                ],
                [
                  749,
                  245
                ]
              ]
            },
            {
              "player": 1,
              "ball": true,
              "width": 9,
              "points": [
                [
                  809,
                  438
                ],
                [
                  1000,
                  400
                ],
                [
                  1145,
                  275
                ]
              ]
            },
            {
              "player": 3,
              "ball": false,
              "width": 9,
              "points": [
                [
                  638,
                  438
                ],
                [
                  760,
                  545
                ],
                [
                  1270,
                  400
                ]
              ]
            },
            {
              "player": null,
              "ball": false,
              "width": 4,
              "optionLine": true,
              "points": [
                [
                  1053.8600000000001,
                  342.17
                ],
                [
                  1081.5200000000002,
                  447.92
                ]
              ]
            },
            {
              "player": 5,
              "ball": false,
              "width": 9,
              "points": [
                [
                  462,
                  204
                ],
                [
                  530,
                  90
                ],
                [
                  560,
                  42
                ],
                [
                  805,
                  35
                ],
                [
                  978,
                  42
                ]
              ]
            },
            {
              "player": 4,
              "ball": false,
              "width": 9,
              "points": [
                [
                  0,
                  0
                ]
              ],
              "wingSeamRelative": true,
              "sameSideOffsets": [
                [
                  0,
                  0
                ],
                [
                  -15,
                  -189
                ],
                [
                  140,
                  -409
                ],
                [
                  70,
                  -519
                ],
                [
                  -30,
                  -599
                ]
              ],
              "crossOffsets": [
                [
                  0,
                  0
                ],
                [
                  -15,
                  -209
                ],
                [
                  40,
                  -499
                ],
                [
                  390,
                  -569
                ],
                [
                  740,
                  -599
                ]
              ]
            },
            {
              "player": 6,
              "ball": false,
              "width": 9,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1100,
                  90
                ],
                [
                  1080,
                  30
                ],
                [
                  1400,
                  -70
                ],
                [
                  1520,
                  -90
                ]
              ]
            }
          ],
          "defense4x4": [
            {
              "pos": [
                436,
                110
              ],
              "label": "DE",
              "id": "DE_L"
            },
            {
              "pos": [
                662,
                110
              ],
              "label": "DT",
              "id": "DT_L"
            },
            {
              "pos": [
                949,
                110
              ],
              "label": "DT",
              "id": "DT_R"
            },
            {
              "pos": [
                1183,
                110
              ],
              "label": "DE",
              "id": "DE_R"
            },
            {
              "pos": [
                500,
                -20
              ],
              "label": "LB",
              "id": "LB1",
              "extra": true
            },
            {
              "pos": [
                700,
                -20
              ],
              "label": "LB",
              "id": "LB2",
              "extra": true
            },
            {
              "pos": [
                900,
                -20
              ],
              "label": "LB",
              "id": "LB3",
              "extra": true
            },
            {
              "pos": [
                1100,
                -20
              ],
              "label": "LB",
              "id": "LB4",
              "extra": true
            },
            {
              "pos": [
                150,
                90
              ],
              "label": "CB",
              "id": "CB_L",
              "extra": true
            },
            {
              "pos": [
                1460,
                90
              ],
              "label": "CB",
              "id": "CB_R",
              "extra": true
            },
            {
              "pos": [
                805,
                -190
              ],
              "label": "S",
              "id": "FS",
              "extra": true
            }
          ]
        }
      }
    },
    {
      "key": "sweep",
      "label": "Sweep",
      "hasReadToggle": false,
      "directions": {
        "Left": {
          "defense": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "OLB_L",
              "label": "LB",
              "pos": [
                600,
                -20
              ]
            },
            {
              "extra": true,
              "id": "MLB",
              "label": "LB",
              "pos": [
                805,
                -20
              ]
            },
            {
              "extra": true,
              "id": "OLB_R",
              "label": "LB",
              "pos": [
                1010,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                650,
                -190
              ]
            },
            {
              "extra": true,
              "id": "SS",
              "label": "S",
              "pos": [
                960,
                -190
              ]
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "ball": false,
              "lineThenCurve": true,
              "player": 3,
              "points": [
                [
                  638,
                  438
                ],
                [
                  307.57000732421875,
                  349.84368896484375
                ],
                [
                  182.96408081054688,
                  288.3293762207031
                ],
                [
                  176.65492248535156,
                  228.39236450195312
                ]
              ],
              "width": 9
            },
            {
              "ball": true,
              "player": 2,
              "points": [
                [
                  985,
                  438
                ],
                [
                  520.504150390625,
                  411.3580017089844
                ],
                [
                  427.4440612792969,
                  332.4934997558594
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "delayMs": 500,
              "player": 1,
              "points": [
                [
                  809,
                  438
                ],
                [
                  1083.5394287109375,
                  460.3507995605469
                ],
                [
                  1295.05859375,
                  427.9092102050781
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 5,
              "points": [
                [
                  462,
                  204
                ],
                [
                  438.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  462,
                  204
                ],
                [
                  438.6,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LT",
              "isBlocking": true,
              "points": [
                [
                  577,
                  204
                ],
                [
                  450.1,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  577,
                  204
                ],
                [
                  507.7,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LG",
              "isBlocking": true,
              "points": [
                [
                  692,
                  204
                ],
                [
                  665,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  692,
                  204
                ],
                [
                  665,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "C",
              "isBlocking": true,
              "points": [
                [
                  806,
                  204
                ],
                [
                  806,
                  144
                ]
              ],
              "points4x4": [
                [
                  806,
                  204
                ],
                [
                  710.6,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RG",
              "isBlocking": true,
              "points": [
                [
                  921,
                  204
                ],
                [
                  1383.2818603515625,
                  351.4209899902344
                ]
              ],
              "points4x4": [
                [
                  921,
                  204
                ],
                [
                  902.1,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RT",
              "isBlocking": true,
              "points": [
                [
                  1035,
                  204
                ],
                [
                  1168.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1035,
                  204
                ],
                [
                  957.6,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 6,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1179.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1149,
                  204
                ],
                [
                  1104.9,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "blockRelative": true,
              "crossPoints": [
                [
                  0,
                  0
                ],
                [
                  156,
                  -188
                ]
              ],
              "crossPoints4x4": [
                [
                  0,
                  0
                ],
                [
                  401.4000000000001,
                  -413.1
                ]
              ],
              "isBlocking": true,
              "player": 4,
              "sameSidePoints": [
                [
                  0,
                  0
                ],
                [
                  156,
                  -188
                ]
              ],
              "sameSidePoints4x4": [
                [
                  0,
                  0
                ],
                [
                  68.39999999999998,
                  -143.1
                ]
              ],
              "width": 7
            }
          ],
          "defense4x4": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "LB1",
              "label": "LB",
              "pos": [
                500,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB2",
              "label": "LB",
              "pos": [
                700,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB3",
              "label": "LB",
              "pos": [
                900,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB4",
              "label": "LB",
              "pos": [
                1100,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ]
        },
        "Right": {
          "defense": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "OLB_L",
              "label": "LB",
              "pos": [
                600,
                -20
              ]
            },
            {
              "extra": true,
              "id": "MLB",
              "label": "LB",
              "pos": [
                805,
                -20
              ]
            },
            {
              "extra": true,
              "id": "OLB_R",
              "label": "LB",
              "pos": [
                1011,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "ball": false,
              "lineThenCurve": true,
              "player": 2,
              "points": [
                [
                  973,
                  438
                ],
                [
                  1179.8114013671875,
                  376.6576232910156
                ],
                [
                  1358.045166015625,
                  316.7206115722656
                ],
                [
                  1462.1463623046875,
                  157.414306640625
                ]
              ],
              "width": 9
            },
            {
              "ball": true,
              "player": 3,
              "points": [
                [
                  626,
                  438
                ],
                [
                  859.043701171875,
                  404.55126953125
                ],
                [
                  1040.716552734375,
                  377.30035400390625
                ],
                [
                  1141.934326171875,
                  364.3236999511719
                ],
                [
                  1305.99462890625,
                  280.44293212890625
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "delayMs": 500,
              "player": 1,
              "points": [
                [
                  802,
                  438
                ],
                [
                  576.3677978515625,
                  470.321044921875
                ],
                [
                  382.70697021484375,
                  425.36407470703125
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 5,
              "points": [
                [
                  462,
                  204
                ],
                [
                  438.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  462,
                  204
                ],
                [
                  496.2,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LT",
              "isBlocking": true,
              "points": [
                [
                  577,
                  204
                ],
                [
                  450.1,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  577,
                  204
                ],
                [
                  653.5,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LG",
              "isBlocking": true,
              "points": [
                [
                  692,
                  204
                ],
                [
                  665,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  692,
                  204
                ],
                [
                  699.2,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "C",
              "isBlocking": true,
              "points": [
                [
                  806,
                  204
                ],
                [
                  806,
                  144
                ]
              ],
              "points4x4": [
                [
                  806,
                  204
                ],
                [
                  890.6,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RG",
              "isBlocking": true,
              "points": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RT",
              "isBlocking": true,
              "points": [
                [
                  1035,
                  204
                ],
                [
                  1168.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1035,
                  204
                ],
                [
                  1093.5,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 6,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1179.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1149,
                  204
                ],
                [
                  1179.6,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "blockRelative": true,
              "crossPoints": [
                [
                  0,
                  0
                ],
                [
                  156,
                  -188
                ]
              ],
              "crossPoints4x4": [
                [
                  0,
                  0
                ],
                [
                  400.5,
                  -413.1
                ]
              ],
              "isBlocking": true,
              "player": 4,
              "sameSidePoints": [
                [
                  0,
                  0
                ],
                [
                  156,
                  -188
                ]
              ],
              "sameSidePoints4x4": [
                [
                  0,
                  0
                ],
                [
                  61.200000000000045,
                  -143.1
                ]
              ],
              "width": 7
            }
          ],
          "defense4x4": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "LB1",
              "label": "LB",
              "pos": [
                500,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB2",
              "label": "LB",
              "pos": [
                700,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB3",
              "label": "LB",
              "pos": [
                900,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB4",
              "label": "LB",
              "pos": [
                1100,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ]
        }
      },
      "hasInsideOutside": false
    },
    {
      "key": "shuffle_pass",
      "label": "Shuffle Pass",
      "hasReadToggle": false,
      "directions": {
        "Right": {
          "defense": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "OLB_L",
              "label": "LB",
              "pos": [
                600,
                -20
              ]
            },
            {
              "extra": true,
              "id": "MLB",
              "label": "LB",
              "pos": [
                805,
                -20
              ]
            },
            {
              "extra": true,
              "id": "OLB_R",
              "label": "LB",
              "pos": [
                1011,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "ball": false,
              "lineThenCurve": true,
              "player": 2,
              "points": [
                [
                  973,
                  438
                ],
                [
                  1179.8114013671875,
                  376.6576232910156
                ],
                [
                  1358.045166015625,
                  316.7206115722656
                ],
                [
                  1462.1463623046875,
                  157.414306640625
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "player": 3,
              "points": [
                [
                  626,
                  438
                ],
                [
                  859.043701171875,
                  404.55126953125
                ],
                [
                  1040.716552734375,
                  377.30035400390625
                ],
                [
                  1141.934326171875,
                  364.3236999511719
                ],
                [
                  1305.99462890625,
                  280.44293212890625
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "delayMs": 500,
              "player": 1,
              "points": [
                [
                  802,
                  438
                ],
                [
                  576.3677978515625,
                  470.321044921875
                ],
                [
                  382.70697021484375,
                  425.36407470703125
                ]
              ],
              "width": 9
            },
            {
              "ball": true,
              "player": 5,
              "points": [
                [
                  462,
                  204
                ],
                [
                  419,
                  185
                ],
                [
                  626,
                  345
                ],
                [
                  911,
                  415
                ],
                [
                  1191,
                  380
                ],
                [
                  1401,
                  300
                ]
              ],
              "width": 7,
              "delayMs": 500
            },
            {
              "ball": false,
              "id": "LT",
              "isBlocking": true,
              "points": [
                [
                  577,
                  204
                ],
                [
                  450.1,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  577,
                  204
                ],
                [
                  653.5,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LG",
              "isBlocking": true,
              "points": [
                [
                  692,
                  204
                ],
                [
                  665,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  692,
                  204
                ],
                [
                  699.2,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "C",
              "isBlocking": true,
              "points": [
                [
                  806,
                  204
                ],
                [
                  806,
                  144
                ]
              ],
              "points4x4": [
                [
                  806,
                  204
                ],
                [
                  890.6,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RG",
              "isBlocking": true,
              "points": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RT",
              "isBlocking": true,
              "points": [
                [
                  1035,
                  204
                ],
                [
                  1168.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1035,
                  204
                ],
                [
                  1093.5,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 6,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1179.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1149,
                  204
                ],
                [
                  1179.6,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "player": 4,
              "points": [
                [
                  360,
                  269
                ],
                [
                  311,
                  200
                ]
              ],
              "width": 9,
              "isBlocking": true
            }
          ],
          "defense4x4": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "LB1",
              "label": "LB",
              "pos": [
                500,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB2",
              "label": "LB",
              "pos": [
                700,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB3",
              "label": "LB",
              "pos": [
                900,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB4",
              "label": "LB",
              "pos": [
                1100,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ]
        },
        "Left": {
          "defense": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "OLB_L",
              "label": "LB",
              "pos": [
                600,
                -20
              ]
            },
            {
              "extra": true,
              "id": "MLB",
              "label": "LB",
              "pos": [
                805,
                -20
              ]
            },
            {
              "extra": true,
              "id": "OLB_R",
              "label": "LB",
              "pos": [
                1010,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                650,
                -190
              ]
            },
            {
              "extra": true,
              "id": "SS",
              "label": "S",
              "pos": [
                960,
                -190
              ]
            }
          ],
          "defense4x4": [
            {
              "id": "DE_L",
              "label": "DE",
              "pos": [
                436,
                110
              ]
            },
            {
              "id": "DT_L",
              "label": "DT",
              "pos": [
                662,
                110
              ]
            },
            {
              "id": "DT_R",
              "label": "DT",
              "pos": [
                949,
                110
              ]
            },
            {
              "id": "DE_R",
              "label": "DE",
              "pos": [
                1183,
                110
              ]
            },
            {
              "extra": true,
              "id": "LB1",
              "label": "LB",
              "pos": [
                500,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB2",
              "label": "LB",
              "pos": [
                700,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB3",
              "label": "LB",
              "pos": [
                900,
                -20
              ]
            },
            {
              "extra": true,
              "id": "LB4",
              "label": "LB",
              "pos": [
                1100,
                -20
              ]
            },
            {
              "extra": true,
              "id": "CB_L",
              "label": "CB",
              "pos": [
                150,
                90
              ]
            },
            {
              "extra": true,
              "id": "CB_R",
              "label": "CB",
              "pos": [
                1460,
                90
              ]
            },
            {
              "extra": true,
              "id": "FS",
              "label": "S",
              "pos": [
                805,
                -190
              ]
            }
          ],
          "readKeyId": null,
          "paths": [
            {
              "ball": false,
              "delayMs": 500,
              "player": 1,
              "points": [
                [
                  809,
                  438
                ],
                [
                  1083.5394287109375,
                  460.3507995605469
                ],
                [
                  1295.05859375,
                  427.9092102050781
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "player": 2,
              "points": [
                [
                  985,
                  438
                ],
                [
                  520.504150390625,
                  411.3580017089844
                ],
                [
                  427.4440612792969,
                  332.4934997558594
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "lineThenCurve": true,
              "player": 3,
              "points": [
                [
                  638,
                  438
                ],
                [
                  307.57000732421875,
                  349.84368896484375
                ],
                [
                  182.96408081054688,
                  288.3293762207031
                ],
                [
                  176.65492248535156,
                  228.39236450195312
                ]
              ],
              "width": 9
            },
            {
              "ball": false,
              "isBlocking": true,
              "player": 5,
              "points": [
                [
                  462,
                  204
                ],
                [
                  438.6,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  462,
                  204
                ],
                [
                  496.2,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LT",
              "isBlocking": true,
              "points": [
                [
                  577,
                  204
                ],
                [
                  450.1,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  577,
                  204
                ],
                [
                  653.5,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "LG",
              "isBlocking": true,
              "points": [
                [
                  692,
                  204
                ],
                [
                  665,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  692,
                  204
                ],
                [
                  699.2,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "C",
              "isBlocking": true,
              "points": [
                [
                  806,
                  204
                ],
                [
                  806,
                  144
                ]
              ],
              "points4x4": [
                [
                  806,
                  204
                ],
                [
                  890.6,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RG",
              "isBlocking": true,
              "points": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  921,
                  204
                ],
                [
                  946.2,
                  119.39999999999999
                ]
              ],
              "width": 7
            },
            {
              "ball": false,
              "id": "RT",
              "isBlocking": true,
              "points": [
                [
                  1035,
                  204
                ],
                [
                  1168.2,
                  119.39999999999999
                ]
              ],
              "points4x4": [
                [
                  1035,
                  204
                ],
                [
                  1093.5,
                  2.4000000000000057
                ]
              ],
              "width": 7
            },
            {
              "ball": true,
              "player": 6,
              "points": [
                [
                  1149,
                  204
                ],
                [
                  1192,
                  185
                ],
                [
                  985,
                  345
                ],
                [
                  700,
                  415
                ],
                [
                  420,
                  380
                ],
                [
                  210,
                  300
                ]
              ],
              "width": 7,
              "delayMs": 500
            },
            {
              "ball": false,
              "player": 4,
              "points": [
                [
                  1251,
                  269
                ],
                [
                  1300,
                  200
                ]
              ],
              "width": 9,
              "isBlocking": true
            }
          ]
        }
      },
      "wingOnly": true,
      "p4StartsOpposite": true
    }
  ]
};
