def func(s):
    a = len(s)
    b = s.lower()
    c = []
    for i in b:
        if b.count(i) == 1:
            c.append(i)
    return len(c)

print(func("Helloworld"))
