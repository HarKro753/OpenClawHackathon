//
//  Environment+Managers.swift
//  OpenClawApp
//

import SwiftUI

private struct ChatManagerKey: EnvironmentKey {
    static let defaultValue = ChatManager()
}

private struct IntegrationsManagerKey: EnvironmentKey {
    static let defaultValue = IntegrationsManager()
}

extension EnvironmentValues {
    var chatManager: ChatManager {
        get { self[ChatManagerKey.self] }
        set { self[ChatManagerKey.self] = newValue }
    }

    var integrationsManager: IntegrationsManager {
        get { self[IntegrationsManagerKey.self] }
        set { self[IntegrationsManagerKey.self] = newValue }
    }
}
