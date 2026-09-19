import AuthForm from '@/components/auth-form';
export const metadata = { title: 'Welcome back' };
export default function Login({ searchParams }: { searchParams: { notice?: string } }) { return <AuthForm mode="login" notice={searchParams.notice}/>; }
