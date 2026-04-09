export const messageTemplates = [
  {
    id: "s1f3",
    name: "S1F3 Selected Equipment Status Request",
    category: "Status",
    description: "Host requests one or more status variables by SVID.",
    message: `<L [3]
\t<A [4] "S1F3" >
\t<U4 [3] 1001 1002 1003 >
\t<A [14] "Status Request" >
>`
  },
  {
    id: "s1f13",
    name: "S1F13 Establish Communications",
    category: "Communications",
    description: "Host or equipment establishes communications with a simple identity list.",
    message: `<L [3]
\t<A [5] "S1F13" >
\t<BOOLEAN [1] TRUE >
\t<L [2]
\t\t<A [4] "HOST" >
\t\t<A [8] "LINE-01" >
\t>
>`
  },
  {
    id: "s2f41",
    name: "S2F41 Remote Command",
    category: "Command",
    description: "Remote command example with command code and parameter list.",
    message: `<L [3]
\t<A [5] "S2F41" >
\t<A [8] "STARTLOT" >
\t<L [2]
\t\t<L [2]
\t\t\t<A [7] "LOTID" >
\t\t\t<A [8] "LOT00001" >
\t\t>
\t\t<L [2]
\t\t\t<A [5] "PPID" >
\t\t\t<A [6] "PROC01" >
\t\t>
\t>
>`
  },
  {
    id: "s6f11",
    name: "S6F11 Event Report",
    category: "Events",
    description: "Collection event report with CEID, RPTID, and common values.",
    message: `<L [4]
\t<A [5] "S6F11" >
\t<U4 [1] 5001 >
\t<U4 [1] 100 >
\t<L [1]
\t\t<L [2]
\t\t\t<U4 [1] 7001 >
\t\t\t<L [3]
\t\t\t\t<A [7] "RUNNING" >
\t\t\t\t<U4 [1] 42 >
\t\t\t\t<BOOLEAN [1] TRUE >
\t\t\t>
\t\t>
\t>
>`
  },
  {
    id: "alarm",
    name: "Alarm Payload",
    category: "Alarm",
    description: "Simple alarm state payload with ALID, code, and text.",
    message: `<L [4]
\t<A [5] "ALARM" >
\t<U4 [1] 901 >
\t<BOOLEAN [1] TRUE >
\t<A [20] "Chamber pressure low" >
>`
  },
  {
    id: "recipe",
    name: "Recipe Body Example",
    category: "Recipe",
    description: "Recipe style payload with binary bytes and metadata.",
    message: `<L [4]
\t<A [6] "RECIPE" >
\t<A [6] "ETCH01" >
\t<B [8] 0x10 0x2A 0x03 0x40 0xFF 0x00 0x1C 0x7E >
\t<L [2]
\t\t<A [6] "OWNER1" >
\t\t<A [8] "REV-A001" >
\t>
>`
  }
];
