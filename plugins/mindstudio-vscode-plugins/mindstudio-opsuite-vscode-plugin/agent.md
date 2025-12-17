现在，在按钮下面加一棵树，结构如下
msProf-20251014
    算子性能数据文件
        example2.csv
        example3.csv
        data.BIN
msProf-20251015
    算子性能数据文件
        example.csv
        data.BIN

点击  example2.csv 会打开对应的csv文件

点击data.bin会执行  message.sendMessageToParent({ command: "vscodeinsigLoadData",‘data.bin的地支’ });