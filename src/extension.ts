import * as vscode from 'vscode';
import { SidebarProvider } from './sidebar';

// 插件被激活时执行这个函数
export function activate(context: vscode.ExtensionContext) {
    console.log('AI 代码助手已激活！');

    // 1. 实例化你写的侧边栏提供者
    const sidebarProvider = new SidebarProvider(context.extensionUri);

    // 2. 将侧边栏注册到 VS Code 中 
    // 注意：这里的 'code-assistant-sidebar' 必须和 package.json 里的 id 一模一样！
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "code-assistant-sidebar",
            sidebarProvider
        )
    );
}

// 插件被关闭时执行
export function deactivate() {}