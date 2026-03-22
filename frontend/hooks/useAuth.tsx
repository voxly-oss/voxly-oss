'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    loginWithGoogle: (token: string) => Promise<void>;
    register: (data: {
        email: string;
        password: string;
        full_name?: string;
        agency_name?: string;
    }) => Promise<void>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        checkAuth();
    }, []);

    async function checkAuth() {
        try {
            const storedToken = localStorage.getItem('access_token');
            if (!storedToken) {
                setLoading(false);
                return;
            }
            setToken(storedToken);
            const { data } = await authAPI.me();
            setUser(data);
        } catch (error) {
            localStorage.removeItem('access_token');
            setToken(null);
        } finally {
            setLoading(false);
        }
    }

    async function refreshUser() {
        try {
            const { data } = await authAPI.me();
            setUser(data);
        } catch { /* ignore */ }
    }

    async function login(email: string, password: string) {
        const { data } = await authAPI.login(email, password);
        localStorage.setItem('access_token', data.access_token);
        setToken(data.access_token);
        const { data: userData } = await authAPI.me();
        setUser(userData);
        router.push('/dashboard');
    }

    async function loginWithGoogle(googleToken: string) {
        const { data } = await authAPI.googleLogin(googleToken);
        localStorage.setItem('access_token', data.access_token);
        setToken(data.access_token);
        const { data: userData } = await authAPI.me();
        setUser(userData);
        router.push('/dashboard');
    }

    async function register(registerData: {
        email: string;
        password: string;
        full_name?: string;
        agency_name?: string;
    }) {
        await authAPI.register(registerData);
        await login(registerData.email, registerData.password);
    }

    function logout() {
        localStorage.removeItem('access_token');
        setToken(null);
        setUser(null);
        router.push('/login');
    }

    return (
        <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, register, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
