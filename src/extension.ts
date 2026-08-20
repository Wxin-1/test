// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const openPanel = vscode.commands.registerCommand('code-assistant.showPanel', () => {
		const panel = vscode.window.createWebviewPanel(
			'codeHelper',
			'代码助手面板',
			vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		panel.webview.html = getWebviewContent();

		panel.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'sendQuestion') {
				// message.code 粘贴的代码
				// message.question 用户的问题
				console.log("收到代码：", message.code);
				console.log("收到问题：", message.question);

				// 模拟返回，后续这里替换成调用后端RAG接口
				const mockReply = {
					code: message.code,
					question: message.question,
					aiAnswer: "【模拟AI返回结果】\n代码字段和问题字段已经分开接收。\n这里将来对接后端RAG，后端拿到code和question两个独立字段组装prompt进行推理。"
				};

				panel.webview.postMessage({
					type: 'aiReply',
					data: mockReply
				});
			}
		});
	});

	context.subscriptions.push(openPanel);
}

function getWebviewContent() {
	return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
body{background:#222;color:#fff;padding:10px;box-sizing:border-box;}
#output{margin-bottom:12px;white-space:pre-wrap;min-height:80px;border:1px solid #555;padding:8px;}
textarea{width:100%;background:#fff;color:#000;box-sizing:border-box;}
#codeArea{height:140px;}
#questionArea{height:80px;margin-top:8px;}
button{margin:4px;padding:6px 12px;}
.label{font-size:14px;margin-top:10px;margin-bottom:4px;display:block;color:#ddd;}
.tip{color:#aaa;font-size:13px;margin:4px 0 8px;}
</style>
</head>
<body>
<div id="output"></div>

<div class="tip">操作提示：复制代码粘贴到上方代码框，在下方输入你的问题</div>

<label class="label">📄代码片段（粘贴复制的代码）</label>
<textarea id="codeArea" placeholder="把复制的代码粘贴在这里"></textarea>

<label class="label">❓你的问题</label>
<textarea id="questionArea" placeholder="在这里输入你想问的问题"></textarea>

<br>
<button id="btnSend">发送提问</button>

<script>
const vscode = acquireVsCodeApi();
const outputDom = document.getElementById('output');
const codeArea = document.getElementById('codeArea');
const questionArea = document.getElementById('questionArea');

document.getElementById('btnSend').onclick = ()=>{
    const codeText = codeArea.value.trim();
    const questionText = questionArea.value.trim();
    if(!codeText && !questionText){
        alert("请粘贴代码或者输入问题");
        return;
    }
    // 分开两个字段传递，不拼接
    vscode.postMessage({
        type:'sendQuestion',
        code: codeText,
        question: questionText
    });
};

window.addEventListener('message', event=>{
    const msg = event.data;
    if(msg.type === 'aiReply'){
        outputDom.innerText = \`【用户代码】
\${msg.data.code || "(无代码)"}

【用户提问】
\${msg.data.question || "(无问题)"}

【AI回答】
\${msg.data.aiAnswer}\`;
    }
})
</script>
</body>
</html>
`;
}

export function deactivate() {}