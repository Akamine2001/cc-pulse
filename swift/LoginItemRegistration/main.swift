import Foundation
import ServiceManagement

func registerLoginItem() {
    do {
        if #available(macOS 13.0, *) {
            try SMAppService.mainApp.register()
            print("✅ ログイン項目として登録しました")
            exit(0)
        } else {
            print("❌ macOS 13以降が必要です")
            exit(1)
        }
    } catch {
        print("❌ 登録に失敗: \(error.localizedDescription)")
        let nsError = error as NSError
        print("   エラーコード: \(nsError.code)")
        print("   ドメイン: \(nsError.domain)")
        exit(1)
    }
}

func unregisterLoginItem() {
    do {
        if #available(macOS 13.0, *) {
            try SMAppService.mainApp.unregister()
            print("✅ ログイン項目の登録を解除しました")
            exit(0)
        } else {
            print("❌ macOS 13以降が必要です")
            exit(1)
        }
    } catch {
        print("❌ 解除に失敗: \(error.localizedDescription)")
        exit(1)
    }
}

func checkStatus() {
    if #available(macOS 13.0, *) {
        let status = SMAppService.mainApp.status

        switch status {
        case .enabled:
            print("✅ 登録済み（有効）")
        case .requiresApproval:
            print("⚠️  ユーザー承認待ち")
            print("   システム設定 → 一般 → ログイン項目 でONにしてください")
        case .notRegistered:
            print("❌ 未登録")
        case .notFound:
            print("❌ アプリが見つかりません")
        @unknown default:
            print("⚠️  不明な状態")
        }
    } else {
        print("❌ macOS 13以降が必要です")
        exit(1)
    }

    exit(0)
}

func printUsage() {
    print("""
    使い方:
      cc-pulse-register register    ログイン項目として登録
      cc-pulse-register unregister  登録解除
      cc-pulse-register status      登録状態確認
    """)
}

// Main entry point
let args = CommandLine.arguments

guard args.count > 1 else {
    printUsage()
    exit(1)
}

switch args[1] {
case "register":
    registerLoginItem()
case "unregister":
    unregisterLoginItem()
case "status":
    checkStatus()
default:
    printUsage()
    exit(1)
}
