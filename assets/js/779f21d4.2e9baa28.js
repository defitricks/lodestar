"use strict";(self.webpackChunk_lodestar_docs=self.webpackChunk_lodestar_docs||[]).push([[1799],{4849:(e,n,i)=>{i.r(n),i.d(n,{assets:()=>l,contentTitle:()=>r,default:()=>h,frontMatter:()=>t,metadata:()=>o,toc:()=>d});var s=i(4848),a=i(8453);const t={title:"Flame Graphs"},r="Generating Flamegraphs for a Running Node Service on Linux",o={id:"tools/flamegraphs",title:"Flame Graphs",description:"This guide assumes a running instance of Lodestar and will walk through how to generate a flamegraph for the process while running on Linux. While it is possible to run Lodestar in a number of ways, for performance profiling it is recommended to not use Dockerized implementations. It is best to run Lodestar as a service on a Linux machine. Follow the Lodestar docs to get the service installed and running. Then come back here when you are ready to generate the flamegraph.",source:"@site/pages/tools/flamegraphs.md",sourceDirName:"tools",slug:"/tools/flamegraphs",permalink:"/lodestar/tools/flamegraphs",draft:!1,unlisted:!1,editUrl:"https://github.com/ChainSafe/lodestar/tree/unstable/docs/pages/tools/flamegraphs.md",tags:[],version:"current",frontMatter:{title:"Flame Graphs"},sidebar:"tutorialSidebar",previous:{title:"Specification Tests",permalink:"/lodestar/contribution/testing/spec-tests"},next:{title:"Heap Dumps",permalink:"/lodestar/tools/heap-dumps"}},l={},d=[{value:"Modifying Linux and Lodestar",id:"modifying-linux-and-lodestar",level:2},{value:"Example start_lodestar.sh",id:"example-start_lodestarsh",level:3},{value:"Capturing Stack Traces",id:"capturing-stack-traces",level:3},{value:"Rendering a Flamegraph",id:"rendering-a-flamegraph",level:2},{value:"Installation",id:"installation",level:2},{value:"Usage",id:"usage",level:2},{value:"Filtering Results",id:"filtering-results",level:2},{value:"Unfiltered",id:"unfiltered",level:3},{value:"Filtered",id:"filtered",level:3},{value:"References",id:"references",level:2},{value:"List of Web References",id:"list-of-web-references",level:3},{value:"Visualization Tools",id:"visualization-tools",level:3},{value:"Collecting on Linux",id:"collecting-on-linux",level:3},{value:"Collecting on MacOS",id:"collecting-on-macos",level:3}];function c(e){const n={a:"a",code:"code",em:"em",h1:"h1",h2:"h2",h3:"h3",li:"li",p:"p",pre:"pre",ul:"ul",...(0,a.R)(),...e.components};return(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(n.h1,{id:"generating-flamegraphs-for-a-running-node-service-on-linux",children:"Generating Flamegraphs for a Running Node Service on Linux"}),"\n",(0,s.jsx)(n.p,{children:"This guide assumes a running instance of Lodestar and will walk through how to generate a flamegraph for the process while running on Linux. While it is possible to run Lodestar in a number of ways, for performance profiling it is recommended to not use Dockerized implementations. It is best to run Lodestar as a service on a Linux machine. Follow the Lodestar docs to get the service installed and running. Then come back here when you are ready to generate the flamegraph."}),"\n",(0,s.jsx)(n.h2,{id:"modifying-linux-and-lodestar",children:"Modifying Linux and Lodestar"}),"\n",(0,s.jsxs)(n.p,{children:["Use the following two commands to install ",(0,s.jsx)(n.code,{children:"perf"})," for generating the stack traces. You may get a warning about needing to restart the VM due to kernel updates. This is nothing to be concerned with and if so, cancel out of the restart dialog."]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-bash",children:"sudo apt-get install linux-tools-common linux-tools-generic\nsudo apt-get install linux-tools-`uname -r`  # empirically this throws if run on the same line above\n"})}),"\n",(0,s.jsxs)(n.p,{children:["Next we need to update the Lodestar service by modifying the start script. We need to add a necessary flag ",(0,s.jsx)(n.code,{children:"--perf-basic-prof"})," to allow the stack traces to be useful. Node is a virtual machine and ",(0,s.jsx)(n.code,{children:"perf"})," is designed to capture host stack traces. In order to allow the JavaScript functions to be captured meaningfully, ",(0,s.jsx)(n.code,{children:"v8"})," can provide some help. Generally Lodestar is started with a script like the following:"]}),"\n",(0,s.jsx)(n.h3,{id:"example-start_lodestarsh",children:"Example start_lodestar.sh"}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"node \\\n  --perf-basic-prof \\\n  --max-old-space-size=8192 \\\n  /usr/src/lodestar/packages/cli/bin/lodestar \\\n  beacon \\\n  --rcConfig /home/devops/beacon/rcconfig.yml\n"})}),"\n",(0,s.jsxs)(n.p,{children:["After updating the start script, restart the node process running the beacon service. Note in the command below, that the ",(0,s.jsx)(n.code,{children:"beacon"})," service may have a different name or restart command, depending on your setup."]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"admin@12.34.56.78: sudo systemctl restart beacon\n"})}),"\n",(0,s.jsxs)(n.p,{children:["The flag that was added notifies ",(0,s.jsx)(n.code,{children:"V8"})," to output a map of functions and their addresses. This is necessary for ",(0,s.jsx)(n.code,{children:"perf"})," to generate the stack traces for the virtual machine in addition to the traditional host stack traces. There is a very small, performance overhead to output the maps. After a short while, once the process runs for a bit the functions will no longer be moving in memory and the overhead will be significantly reduced. The VM will still be moving objects around but this flag is generally safe to run in production. After a few minutes of running, listing the directory with the start script (",(0,s.jsx)(n.code,{children:"process.cwd()"}),") will look similar:"]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"-rw-r--r--  1 admin admin   9701529 May 22 00:36 beacon-2023-05-22.log\n-rwxrwxr-x  1 admin root        421 May 22 00:31 beacon_run.sh\ndrwxr-xr-x  2 admin admin    917504 May 22 00:35 chain-db\n-rw-r--r--  1 admin admin   2861242 May 22 00:36 isolate-0x6761520-2085004-v8.log\n-rw-r--r--  1 admin admin    203172 May 22 00:36 isolate-0x7fa2f0001060-2085004-v8.log\n-rw-r--r--  1 admin admin     68044 May 22 00:36 isolate-0x7fcd80001060-2085004-v8.log\n-rw-r--r--  1 admin admin    420809 May 22 00:36 isolate-0x7fcd84001060-2085004-v8.log\n-rw-r--r--  1 admin admin    123919 May 22 00:36 isolate-0x7fcd88001060-2085004-v8.log\n-rw-r--r--  1 admin admin     94391 May 22 00:35 isolate-0x7fcd8c001060-2085004-v8.log\n-rw-r--r--  1 admin admin    183831 May 22 00:36 isolate-0x7fcd90000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    152786 May 22 00:36 isolate-0x7fcd94000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    262333 May 22 00:36 isolate-0x7fcd98000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    218473 May 22 00:36 isolate-0x7fcd9c000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    366788 May 22 00:36 isolate-0x7fcda0000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    304917 May 22 00:36 isolate-0x7fcda4000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    586238 May 22 00:36 isolate-0x7fcda8000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    450675 May 22 00:36 isolate-0x7fcdac000e60-2085004-v8.log\n-rw-r--r--  1 admin admin    768470 May 22 00:36 isolate-0x7fcdb8000d60-2085004-v8.log\n-rw-r--r--  1 admin root        559 May 21 14:17 rcconfig.yml\n"})}),"\n",(0,s.jsxs)(n.p,{children:["The ",(0,s.jsx)(n.code,{children:"isolate-*-v8.log"})," files are the maps that ",(0,s.jsx)(n.code,{children:"v8"})," outputs for the ",(0,s.jsx)(n.code,{children:"perf"})," command to reference. You are now ready to collect the stack traces."]}),"\n",(0,s.jsx)(n.h3,{id:"capturing-stack-traces",children:"Capturing Stack Traces"}),"\n",(0,s.jsxs)(n.p,{children:["The first command below will run ",(0,s.jsx)(n.code,{children:"perf"})," for 60 seconds, and then save the output to a file named ",(0,s.jsx)(n.code,{children:"perf.out"}),". The second one will merge the exported, unknown, tokens with the isolate maps and output full stack traces for the render. Running both ",(0,s.jsx)(n.code,{children:"perf"})," commands in the folder with the ",(0,s.jsx)(n.code,{children:"isolate"})," maps will allow the data to be seamlessly spliced. Once the output is saved, update the permissions so the file can be copied to your local machine via ",(0,s.jsx)(n.code,{children:"scp"}),"."]}),"\n",(0,s.jsxs)(n.p,{children:["You can modify the frequency of capture by changing ",(0,s.jsx)(n.code,{children:"-F 99"})," to a different number. Try to stay away from whole numbers as they are more likely to cause interference with periodically scheduled tasks. As an example use ",(0,s.jsx)(n.code,{children:"99Hz"})," or ",(0,s.jsx)(n.code,{children:"997Hz"})," instead of ",(0,s.jsx)(n.code,{children:"100Hz"})," or ",(0,s.jsx)(n.code,{children:"1000Hz"}),". In testing neither seemed to have an appreciable affect on CPU usage when run for a short period of time."]}),"\n",(0,s.jsx)(n.p,{children:"To change the period of capture adjust the sleep duration (which is in seconds)."}),"\n",(0,s.jsxs)(n.p,{children:["The ",(0,s.jsx)(n.code,{children:"pgrep"})," command is used to find the process id to capture against. Feel free to pass a number to the ",(0,s.jsx)(n.code,{children:"-p"})," flag if you know the process id, or adjust the file path if the executable is in a different location."]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"admin@12.34.56.78: sudo perf record -F 99 -p $(pgrep -f '/usr/src/lodestar/packages/cli/bin/lodestar beacon') -g -- sleep 60\nadmin@12.34.56.78: sudo perf script -f > perf.out\nadmin@12.34.56.78: sudo chmod 777 ~/beacon/perf.out\n"})}),"\n",(0,s.jsxs)(n.p,{children:["And then copy the ",(0,s.jsx)(n.code,{children:"perf.out"})," file to your local machine to render the flamegraph. Running at ",(0,s.jsx)(n.code,{children:"99Hz"})," for 180 seconds results in a file size of about 3.5MB and ",(0,s.jsx)(n.code,{children:"997Hz"})," for 60 seconds is roughly 4.4MB."]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"scp admin@12.34.56.78:/home/devops/beacon/out.perf /some_temp_dir/perf.out\n"})}),"\n",(0,s.jsx)(n.h2,{id:"rendering-a-flamegraph",children:"Rendering a Flamegraph"}),"\n",(0,s.jsxs)(n.p,{children:["By far the best tool to render flamegraphs is ",(0,s.jsx)(n.a,{href:"https://github.com/Netflix/flamescope",children:(0,s.jsx)(n.code,{children:"flamescope"})})," from Netflix. It allows for easy analysis and zooming into specific time periods. It also give a holistic view of how the process is performing over time."]}),"\n",(0,s.jsx)(n.h2,{id:"installation",children:"Installation"}),"\n",(0,s.jsx)(n.p,{children:"Python3 is required. Clone the repository and install the dependencies:"}),"\n",(0,s.jsx)(n.p,{children:(0,s.jsx)(n.em,{children:"The original is no longer maintained and had a configuration bug. This is a fork that fixes the issue."})}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"git clone https://github.com/matthewkeil/flamescope\ncd flamescope\npip3 install -r requirements.txt\nyarn\n"})}),"\n",(0,s.jsx)(n.h2,{id:"usage",children:"Usage"}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"mv /some_temp_dir/perf.out /path/to/flamescope/examples\nyarn dev\n"})}),"\n",(0,s.jsxs)(n.p,{children:["Then navigate in a browser to ",(0,s.jsx)(n.code,{children:"http://localhost:8080"})," and begin analyzing the data."]}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/home-screen.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/time-series-view.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/selecting-series.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/unfiltered-flamegraph.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/zoom-in.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)(n.h2,{id:"filtering-results",children:"Filtering Results"}),"\n",(0,s.jsxs)(n.p,{children:['There can be a lot of "noise" in the stack traces with ',(0,s.jsx)(n.code,{children:"libc"}),", ",(0,s.jsx)(n.code,{children:"v8"})," and ",(0,s.jsx)(n.code,{children:"libuv"})," calls. It is possible to filter the results to make it more useful, but note this will skew the results. Looking at the graph both filtered and unfiltered can be beneficial. The following ",(0,s.jsx)(n.code,{children:"sed"})," command will remove the noise from the stack traces."]}),"\n",(0,s.jsx)(n.pre,{children:(0,s.jsx)(n.code,{className:"language-sh",children:"sed -r -e \"/( __libc_start| uv_| LazyCompile | v8::internal::| node::| Builtins_| Builtin:| Stub:| LoadIC:| \\\\[unknown\\\\]| LoadPolymorphicIC:)/d\" -e 's/ LazyCompile:[*~]?/ /'\n"})}),"\n",(0,s.jsx)(n.h3,{id:"unfiltered",children:"Unfiltered"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/unfiltered-flamegraph.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)(n.h3,{id:"filtered",children:"Filtered"}),"\n",(0,s.jsx)("img",{src:"../images/flamescope/filtered-flamegraph.png",alt:"flamescope home screen",width:"1024"}),"\n",(0,s.jsx)(n.h2,{id:"references",children:"References"}),"\n",(0,s.jsx)(n.h3,{id:"list-of-web-references",children:"List of Web References"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.brendangregg.com/flamegraphs.html",children:"https://www.brendangregg.com/flamegraphs.html"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://nodejs.org/en/docs/guides/diagnostics-flamegraph",children:"https://nodejs.org/en/docs/guides/diagnostics-flamegraph"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://netflixtechblog.com/netflix-flamescope-a57ca19d47bb",children:"https://netflixtechblog.com/netflix-flamescope-a57ca19d47bb"})}),"\n",(0,s.jsxs)(n.li,{children:[(0,s.jsx)(n.a,{href:"https://jaanhio.me/blog/nodejs-flamegraph-analysis/",children:"https://jaanhio.me/blog/nodejs-flamegraph-analysis/"})," (this was a great one about filtering methodology)"]}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://medium.com/voodoo-engineering/node-js-and-cpu-profiling-on-production-in-real-time-without-downtime-d6e62af173e2",children:"https://medium.com/voodoo-engineering/node-js-and-cpu-profiling-on-production-in-real-time-without-downtime-d6e62af173e2"})}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"visualization-tools",children:"Visualization Tools"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://github.com/Netflix/flamescope",children:(0,s.jsx)(n.code,{children:"flamescope"})})}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"collecting-on-linux",children:"Collecting on Linux"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.brendangregg.com/perf.html",children:"https://www.brendangregg.com/perf.html"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.brendangregg.com/linuxperf.html",children:"https://www.brendangregg.com/linuxperf.html"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://www.brendangregg.com/blog/2014-09-17/node-flame-graphs-on-linux.html",children:"https://www.brendangregg.com/blog/2014-09-17/node-flame-graphs-on-linux.html"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://perf.wiki.kernel.org/index.php/Main_Page",children:"https://perf.wiki.kernel.org/index.php/Main_Page"})}),"\n"]}),"\n",(0,s.jsx)(n.h3,{id:"collecting-on-macos",children:"Collecting on MacOS"}),"\n",(0,s.jsxs)(n.ul,{children:["\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://gist.github.com/zeusdeux/aac6f8500917319213c5",children:"https://gist.github.com/zeusdeux/aac6f8500917319213c5"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://gist.github.com/loderunner/36724cc9ee8db66db305",children:"https://gist.github.com/loderunner/36724cc9ee8db66db305"})}),"\n",(0,s.jsx)(n.li,{children:(0,s.jsx)(n.a,{href:"https://keith.github.io/xcode-man-pages/xctrace.1.html",children:"https://keith.github.io/xcode-man-pages/xctrace.1.html"})}),"\n"]})]})}function h(e={}){const{wrapper:n}={...(0,a.R)(),...e.components};return n?(0,s.jsx)(n,{...e,children:(0,s.jsx)(c,{...e})}):c(e)}},8453:(e,n,i)=>{i.d(n,{R:()=>r,x:()=>o});var s=i(6540);const a={},t=s.createContext(a);function r(e){const n=s.useContext(t);return s.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function o(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(a):e.components||a:r(e.components),s.createElement(t.Provider,{value:n},e.children)}}}]);